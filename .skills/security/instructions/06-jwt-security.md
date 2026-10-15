# JWT Security — Instruction 06

## Coverage

CWE-347, CWE-327 — JWT-specific attacks
OWASP A07:2021, ASVS V3.5

---

## JWT Attack Checks

### 1. Algorithm Confusion (None Attack)

```js
// 🔴 CRITICAL — Accepts "alg: none" = no signature
jwt.verify(token, secret); // if library allows alg:none

// Attacker forges: { "alg": "none", "typ": "JWT" }
// Payload: { "role": "admin" }
// → No signature needed!

// 🟢 Always specify allowed algorithms explicitly
jwt.verify(token, secret, { algorithms: ['HS256'] });
jwt.verify(token, publicKey, { algorithms: ['RS256'] });
// Never allow: 'none', 'HS1', weak algorithms
```

### 2. Algorithm Confusion (HS256 vs RS256)

```js
// 🔴 CRITICAL — If server uses RS256 but accepts HS256
// Attacker uses the PUBLIC KEY as the HS256 secret key!
// Public keys are... public → attacker can sign tokens

// 🟢 Lock algorithm to what the server expects
jwt.verify(token, publicKey, { algorithms: ['RS256'] });
// Never: jwt.verify(token, publicKey)  // accepts any algorithm
```

### 3. jku Header Injection

```js
// 🔴 CRITICAL — Server fetches keys from URL in token header
// Token header: { "alg": "RS256", "jku": "https://evil.com/keys.json" }
// Server fetches attacker's keys → validates attacker's token!

// 🟢 Never use jku automatically. If needed, validate against allowlist:
const ALLOWED_JKU = ['https://auth.yourdomain.com/.well-known/jwks.json'];
if (!ALLOWED_JKU.includes(header.jku)) throw new Error('Invalid jku');
```

### 4. Embedded JWK Attack

```js
// 🔴 CRITICAL — Token contains its own public key
// Header: { "alg": "RS256", "jwk": { "kty": "RSA", "n": "attacker_key" } }
// Server uses embedded key → validates attacker's own tokens

// 🟢 Never use key from token header. Use server-stored keys only.
```

### 5. kid (Key ID) Injection

```js
// 🔴 SQL injection via kid header
// kid: "' UNION SELECT 'attacker_key'--"
// Server queries: SELECT key FROM keys WHERE id = '{kid}'
// → Attacker controls what key is used

// 🔴 Path traversal via kid
// kid: "../../dev/null"  → empty key → signature verification passes

// 🟢 Validate kid against known keys only
const VALID_KIDS = ['key-v1', 'key-v2'];
if (!VALID_KIDS.includes(header.kid)) throw new Error('Invalid kid');
```

### 6. Weak Secret

```js
// 🔴 Short or common secrets are brute-forceable
JWT_SECRET = secret;
JWT_SECRET = password;
JWT_SECRET = 12345678;
JWT_SECRET = your - secret - key;

// 🟢 Minimum 256-bit random secret
// Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET = a4b8c2d9e1f3a7b5c4d2e8f1a3b7c5d9e2f4a8b6c3d1e7f5a4b9c2d8e1f3a7b;
```

### 7. Expiration Time

```js
// 🔴 No expiration = tokens valid forever
jwt.sign(payload, secret); // no expiresIn

// 🔴 Too long
jwt.sign(payload, secret, { expiresIn: '365d' }); // 1 year!

// 🟢 Short-lived access tokens, refresh token pattern
jwt.sign(payload, secret, { expiresIn: '15m' }); // access token
jwt.sign(payload, refreshSecret, { expiresIn: '7d' }); // refresh token
```

### 8. Sensitive Data in Payload

```js
// 🔴 JWT payload is Base64 encoded — NOT encrypted, readable by anyone!
jwt.sign({
  userId: user.id,
  password: user.password, // 🔴 NEVER
  creditCard: user.card, // 🔴 NEVER
  email: user.email, // 🟡 Only if necessary
});

// 🟢 Minimal payload
jwt.sign({ sub: user.id, role: user.role }, secret);
```

### 9. Token Revocation

```js
// 🔴 No revocation = stolen tokens are valid until expiry
// If user logs out or token is stolen, you can't invalidate it

// 🟢 Implement revocation (at least for critical tokens)
// Option 1: Short expiry (15min) + refresh tokens
// Option 2: Token blacklist (Redis)
const blacklist = new Set();
// On logout:
blacklist.add(token);
// On verify:
if (blacklist.has(token)) throw new Error('Token revoked');
```

### 10. JWT in localStorage vs Cookie

```js
// 🔴 localStorage is accessible via XSS
localStorage.setItem('token', jwt);

// 🟢 HttpOnly cookie (not accessible via JS)
res.cookie('token', jwt, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  maxAge: 15 * 60 * 1000, // 15 min
});
```

### 11. Cross-JWT Confusion

```js
// 🔴 Using tokens interchangeably between services
// Token for service A accepted by service B

// 🟢 Always verify audience (aud) claim
jwt.verify(token, secret, {
  algorithms: ['RS256'],
  audience: 'https://api.myservice.com', // reject tokens for other services
  issuer: 'https://auth.myservice.com',
});
```

---

## Complete JWT Verification Template

```js
import jwt from 'jsonwebtoken';

function verifyToken(token) {
  if (!token || typeof token !== 'string') throw new Error('Invalid token');

  const decoded = jwt.verify(token, process.env.JWT_PUBLIC_KEY, {
    algorithms: ['RS256'], // explicit algorithm
    audience: process.env.JWT_AUDIENCE,
    issuer: process.env.JWT_ISSUER,
    clockTolerance: 30, // 30 seconds max clock drift
    ignoreExpiration: false, // always check expiry
  });

  // Check token is not revoked
  if (isRevoked(decoded.jti)) throw new Error('Token revoked');

  return decoded;
}
```
