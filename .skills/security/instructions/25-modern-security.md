# Modern Security — Instruction 25

## Coverage

Trojan Source, Unicode attacks, HTTP/2 attacks, Sec-Fetch, postMessage, Reverse Tabnapping
Session puzzling, Web Cache Poisoning, iFrame security, Autocomplete

---

## Trojan Source (CVE-2021-42574)

### 1. Unicode Bidirectional Characters in Code

```
// 🔴 CRITICAL — Invisible characters that make code look different to humans vs compiler
// What you see:
if (user.role == "admin") { grantAccess() }
// What compiler executes:
if (user.role == "admin‮ ⁦// Check if admin⁩ ⁦") {  // always true!

// These Unicode characters (U+202E, U+2066-U+2069) are INVISIBLE in most editors

// 🟢 Scan for dangerous Unicode in all source files:
```

Run:

```bash
grep -rP "[\x{202A}-\x{202E}\x{2066}-\x{2069}\x{200F}\x{200E}]" --include="*.{js,ts,py,php,go,rb,java}" .
```

Flag ANY file containing these characters as **CRITICAL**.

---

## Unicode Normalization Attacks

### 2. Normalize Before Validation

```js
// 🔴 "ａdmin" (full-width chars) ≠ "admin" (ASCII) to validator
// but after Unicode normalization they become identical

// Attacker registers: "ａdmin@gmail.com" (full-width 'a')
// After normalization: "admin@gmail.com"
// → Account takeover if admin account exists!

// 🟢 Always normalize BEFORE validation and comparison
const normalizedEmail = email.normalize('NFKC').toLowerCase().trim();
const normalizedUsername = username.normalize('NFKC').toLowerCase().trim();

// Apply to: usernames, emails, paths, URLs, any string comparison
```

---

## Reverse Tabnapping

### 3. target="\_blank" Without noopener

```html
<!-- 🔴 The new page can access window.opener and redirect parent! -->
<a href="https://external.com" target="_blank">Click here</a>

<!-- 🟢 Always add rel="noopener noreferrer" -->
<a href="https://external.com" target="_blank" rel="noopener noreferrer">Click here</a>

<!-- CSP can also help: -->
<!-- Scan all HTML files and templates for target="_blank" without rel="noopener" -->
```

---

## postMessage Security

### 4. Always Validate Origin

```js
// 🔴 Accepts messages from ANY origin
window.addEventListener('message', event => {
  doSomething(event.data); // no origin check!
});

// 🔴 Sending to wildcard
window.parent.postMessage(sensitiveData, '*'); // goes to any origin!

// 🟢 Strict origin validation
const TRUSTED_ORIGINS = ['https://app.yourdomain.com', 'https://admin.yourdomain.com'];

window.addEventListener('message', event => {
  if (!TRUSTED_ORIGINS.includes(event.origin)) {
    console.warn('Rejected message from:', event.origin);
    return;
  }
  // Validate message structure
  if (!event.data?.type || !VALID_MESSAGE_TYPES.includes(event.data.type)) return;
  doSomething(event.data);
});

// 🟢 Always specify exact target origin when sending
window.parent.postMessage(data, 'https://parent.yourdomain.com');
```

---

## HTTP/2 Attacks

### 5. RST Flood (CVE-2023-44487) — Rapid Reset Attack

```
// 🔴 Node.js < 18.19.1 / 20.x < 20.8.1 vulnerable to HTTP/2 RST flood DDoS
// Check: node --version

// 🟢 Ensure Node.js >= 20.8.1 or >= 18.19.1
// All current LTS versions are patched

// Also mitigated by: Cloudflare, Nginx 1.25.3+, reverse proxy in front of Node
```

### 6. HPACK Bomb

```
// Highly compressed HTTP/2 headers that expand to huge size on decompression
// Handled by HTTP/2 server implementation — ensure server is updated
// Nginx, Node.js, Caddy all have protections in recent versions
```

---

## Web Cache Poisoning

### 7. Unkeyed Headers

```js
// 🔴 Response cached based on URL, but content varies by unkeyed header
// Attacker sends: X-Forwarded-Host: evil.com
// Response cached with evil.com in content → served to other users!

// 🟢 Configure cache to key on all relevant headers
// Vercel/CDN: ensure Vary header is set for all varying dimensions
res.setHeader('Vary', 'Accept-Encoding, Accept-Language');
// Never: cache different content for same URL without Vary header
```

### 8. Fat GET Request Poisoning

```js
// 🔴 GET request with body that affects response
// GET /api/products body: {"category": "poison"}
// If response is cached → all users get poisoned response

// 🟢 GET requests must never use body for response logic
// Use query parameters instead (they're part of the cache key)
```

---

## iFrame Security

### 9. Sandbox External iFrames

```html
<!-- 🔴 Unsandboxed third-party iframe has full capabilities -->
<iframe src="https://third-party.com/widget"></iframe>

<!-- 🟢 Sandbox with minimal permissions -->
<iframe
  src="https://third-party.com/widget"
  sandbox="allow-scripts allow-same-origin"
  allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'"
  referrerpolicy="no-referrer"
  loading="lazy"
>
</iframe>

<!-- Only add sandbox permissions actually needed:
  allow-scripts: JS execution
  allow-same-origin: access to own origin
  allow-forms: form submission
  allow-popups: opening new windows
-->
```

---

## Session Puzzling

### 10. Single Semantics per Session Variable

```js
// 🔴 Session variable used for different purposes
req.session.userId = user.id; // after login
req.session.userId = resetToken; // during password reset
// If attacker completes password reset → userId is set → might be logged in!

// 🟢 Use separate session variables for each purpose
req.session.authenticatedUserId = user.id;
req.session.passwordResetToken = token;
req.session.passwordResetUserId = user.id;
```

---

## HTTP Method Override

### 11. Disable Method Override in Production

```js
// 🔴 X-HTTP-Method-Override header changes DELETE to GET or vice versa
// Attacker bypasses WAF rules that block DELETE

// 🟢 Disable method override middleware
// Don't use: methodOverride() middleware in production
// Express: don't include 'method-override' package unless required
```

---

## Autocomplete on Sensitive Fields

### 12. Autocomplete Attributes

```html
<!-- 🔴 Browser autofill may pre-fill sensitive fields unexpectedly -->
<input type="text" name="creditCard" />

<!-- 🟢 Use specific autocomplete values -->
<input type="text" name="name" autocomplete="name" />
<input type="email" name="email" autocomplete="email" />
<input type="password" name="currentPassword" autocomplete="current-password" />
<input type="password" name="newPassword" autocomplete="new-password" />

<!-- 🔴 For OTP/2FA: turn off to prevent autofill -->
<input type="text" name="otp" autocomplete="off" inputmode="numeric" />

<!-- For payment: use specific autocomplete tokens -->
<input type="text" name="cc-number" autocomplete="cc-number" />
```

---

## Content-Type Validation

### 13. Validate Incoming Content-Type

```js
// 🔴 Server parses unexpected content types
// Attacker sends XML instead of JSON → may trigger different parser

// 🟢 Validate Content-Type for all API endpoints
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    if (!req.is('application/json')) {
      return res.status(415).json({ error: 'Unsupported Media Type. Expected application/json' });
    }
  }
  next();
});

// For file upload endpoints: accept only expected MIME types
```
