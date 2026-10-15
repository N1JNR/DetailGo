# Advanced Attacks — Instruction 11

## Coverage

SSRF, SSTI, Prototype Pollution, Zip Slip, Open Redirect, XXE, Mass Assignment, IDOR
CWE-918, CWE-94, CWE-1321, CWE-22, CWE-601

---

## SSRF (Server-Side Request Forgery)

### 1. Validate URLs Before Fetching

```js
// 🔴 CRITICAL — Server fetches any URL the user provides
app.post('/fetch', async (req, res) => {
  const data = await fetch(req.body.url); // SSRF!
  // Attacker: url = "http://169.254.169.254/latest/meta-data/iam/security-credentials"
  // → AWS metadata with credentials!
});

// 🟢 Allowlist approach
const ALLOWED_DOMAINS = ['api.trusted.com', 'cdn.partner.com'];
function isAllowedUrl(url) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  if (!ALLOWED_DOMAINS.includes(parsed.hostname)) return false;
  return true;
}

// 🟢 Block private/internal IPs
const BLOCKED_RANGES = ['127.', '10.', '172.16.', '192.168.', '169.254.', '::1', 'localhost'];
function isPrivateIp(host) {
  return BLOCKED_RANGES.some(range => host.startsWith(range));
}
```

---

## SSTI (Server-Side Template Injection)

### 2. Never Use User Input in Templates

```js
// 🔴 CRITICAL — Template injection
// Pug
res.render('template', { name: req.query.name });
// If name = "#{root.process.mainModule.require('child_process').execSync('id').toString()}"
// → RCE!

// 🔴 Handlebars - prototype pollution via template
// {{constructor.prototype.toString}}

// 🟢 Escape user input before template rendering
// Use template-specific escaping functions
// Never pass raw user input as template variables for unsafe contexts
```

Scan for: `res.render(`, `template.render(`, `Jinja2`, `Twig`, `Smarty` with user input

---

## Prototype Pollution

### 3. Object Operations with User Input

```js
// 🔴 CRITICAL — Pollutes Object.prototype
function merge(target, source) {
  for (const key in source) {
    target[key] = source[key]; // if key is "__proto__"...
  }
}
merge({}, JSON.parse('{"__proto__": {"isAdmin": true}}'));
// Now: ({}).isAdmin === true for ALL objects!

// 🔴 Lodash merge before patch
_.merge({}, userInput);

// 🟢 Protection approaches
// Option 1: Validate keys before merge
function safeMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    target[key] = source[key];
  }
}
// Option 2: Create object without prototype
const safe = Object.create(null);
// Option 3: Use JSON.parse with schema validation (Zod, Yup)
```

Scan for: `_.merge`, `Object.assign`, `deep-merge` patterns, `[key]` assignment in loops

---

## Zip Slip

### 4. Archive Extraction Path Validation

```js
// 🔴 CRITICAL — Malicious zip contains "../../etc/cron.d/evil"
// Extraction overwrites system files!
const zip = new AdmZip(uploadedFile);
zip.extractAllTo('/uploads/'); // 🔴 No path validation!

// 🟢 Validate every entry path
const zip = new AdmZip(uploadedFile);
const entries = zip.getEntries();
for (const entry of entries) {
  const entryPath = path.resolve('/uploads/', entry.entryName);
  if (!entryPath.startsWith(path.resolve('/uploads/'))) {
    throw new Error('Zip Slip attack detected');
  }
}
zip.extractAllTo('/uploads/');
```

```python
# Python
import zipfile, os
def safe_extract(zf, target_dir):
    for member in zf.namelist():
        member_path = os.path.abspath(os.path.join(target_dir, member))
        if not member_path.startswith(os.path.abspath(target_dir)):
            raise ValueError(f"Zip Slip: {member}")
    zf.extractall(target_dir)
```

---

## Open Redirect

### 5. Validate Redirect URLs

```js
// 🔴 Open redirect — phishing attacks
const redirect = req.query.next;
res.redirect(redirect);

// 🔴 Insufficient check (bypasses)
if (redirect.startsWith('/')) res.redirect(redirect);
// Bypass: //evil.com or /\evil.com

// 🟢 Strict allowlist
const ALLOWED_PATHS = ['/dashboard', '/profile', '/settings', '/home'];
const redirect = req.query.next;
if (!ALLOWED_PATHS.includes(redirect)) return res.redirect('/dashboard');
res.redirect(redirect);
```

---

## XXE (XML External Entity)

### 6. Disable External Entities in XML Parsing

```js
// 🔴 Default XML parsers may process external entities
// Attack: <!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>

// Node.js - xml2js (safe by default, but verify)
const xml2js = require('xml2js')
const parser = new xml2js.Parser({
  // xml2js is safe by default
})

// Java - disable XXE
DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance()
dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)

// Python - use defusedxml
import defusedxml.ElementTree as ET
ET.parse(xmlfile)  // safe
```

Scan for: `xml.etree`, `lxml`, `libxml2`, `DOMParser`, XML parsing without entity restrictions

---

## XML Bomb (Billion Laughs)

### 7. Limit XML Entity Expansion

```js
// 🔴 Exponential entity expansion crashes server
// <!ENTITY a "aaa"> <!ENTITY b "&a;&a;&a;..."> ...
// Solution: defusedxml (Python), disable DTD processing (Java)

// Node.js — limit with sax parser options
const sax = require('sax');
// sax doesn't expand entities by default — safe
```

---

## Mass Assignment

### 8. Never Pass req.body Directly to DB

```js
// 🔴 CRITICAL — User can set any field
await User.create(req.body);
await user.update(req.body);

// 🟢 Explicitly pick allowed fields
const allowed = ['name', 'email', 'bio'];
const data = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
await User.create(data);

// 🟢 With Zod validation
const UpdateSchema = z.object({ name: z.string(), email: z.string().email() });
const data = UpdateSchema.parse(req.body); // throws if extra fields
```

---

## IDOR (Insecure Direct Object Reference)

### 9. Always Verify Ownership

```js
// 🔴 CRITICAL — User can access any record by changing ID
app.get('/api/invoices/:id', auth, async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  res.json(invoice); // No ownership check!
});

// 🟢 Always verify ownership
app.get('/api/invoices/:id', auth, async (req, res) => {
  const invoice = await Invoice.findOne({
    _id: req.params.id,
    userId: req.user.id, // ← Must match authenticated user
  });
  if (!invoice) return res.status(404).json({ error: 'Not found' });
  res.json(invoice);
});
```

---

## Forced Browsing (CWE-425)

### 10. All Routes Protected by Auth Middleware

```js
// 🔴 Admin route accessible without auth
app.get('/admin/users', getAllUsers);
app.get('/api/export', exportAllData);

// 🟢 Auth middleware on ALL protected routes
const requireAuth = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
};
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
};
app.get('/admin/users', requireAuth, requireAdmin, getAllUsers);
```
