# Cryptography — Instruction 05

## Coverage

CWE-327, CWE-330, CWE-338, CWE-347
OWASP A02:2021, ASVS V6

---

## Algorithm Checks

### 1. Deprecated Algorithms — Never Use

```js
// 🔴 CRITICAL — Broken/weak algorithms
MD5        // collision attacks trivial
SHA-1      // collision attacks known
DES        // 56-bit key, brute-forceable
3DES       // deprecated, Sweet32 attack
RC4        // stream cipher, broken
ECB mode   // patterns visible in ciphertext

// 🟢 CORRECT — 2026 standard
AES-256-GCM       // symmetric encryption
AES-256-CBC + HMAC-SHA256  // if GCM not possible
SHA-256 / SHA-384 / SHA-512  // hashing
RSA-2048+ / ECDSA P-256+    // asymmetric
```

Scan for:

```js
crypto.createHash('md5'); // 🔴
crypto.createHash('sha1'); // 🔴
crypto.createCipheriv('des'); // 🔴
crypto.createCipheriv('aes-256-ecb'); // 🔴
```

### 2. Weak Random for Security

```js
// 🔴 Math.random() is NOT cryptographically secure
const token = Math.random().toString(36); // predictable
const otp = Math.floor(Math.random() * 1000000); // predictable

// 🟢 Use crypto.randomBytes() always for security-sensitive values
const token = crypto.randomBytes(32).toString('hex');
const otp = crypto.randomInt(100000, 999999);
```

### 3. IV (Initialization Vector) Randomness

```js
// 🔴 Static/hardcoded IV
const iv = Buffer.from('0000000000000000', 'hex'); // NEVER
const iv = Buffer.alloc(16, 0); // NEVER

// 🟢 Random IV per encryption, stored with ciphertext
const iv = crypto.randomBytes(16);
const ciphertext = encrypt(data, key, iv);
const stored = iv.toString('hex') + ':' + ciphertext;
```

### 4. Timing-Safe Comparison

```js
// 🔴 Timing attack possible
if (token === req.headers['x-webhook-signature']) {
}
if (hash1 === hash2) {
}

// 🟢 Always use timingSafeEqual
import { timingSafeEqual } from 'crypto';
const safe = timingSafeEqual(Buffer.from(token), Buffer.from(expected));
```

---

## Perfect Forward Secrecy (PFS)

### 5. TLS Ciphers with PFS

```nginx
# Nginx — Force ECDHE/DHE (provides PFS)
ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES128-GCM-SHA256';
ssl_prefer_server_ciphers on;
ssl_protocols TLSv1.2 TLSv1.3;

# 🔴 Avoid: RSA key exchange (no PFS)
# 🟢 Prefer: ECDHE (Elliptic Curve Diffie-Hellman Ephemeral)
```

---

## Cryptographic Agility

### 6. Algorithm Configurable (not hardcoded everywhere)

```js
// 🔴 Algorithm hardcoded in every function
function encrypt(data) {
  return crypto.createCipheriv('aes-256-gcm', KEY, IV);
}

// 🟢 Centralized crypto module
// cryptoConfig.js
export const CIPHER_ALGO = process.env.CIPHER_ALGO || 'aes-256-gcm';
export const HASH_ALGO = process.env.HASH_ALGO || 'sha256';
export const KDF_ALGO = process.env.KDF_ALGO || 'argon2id';
```

---

## Memory Safety (ASVS Level 3)

### 7. Zero Sensitive Data After Use

```js
// 🔴 Secret stays in heap memory until GC
const privateKey = process.env.PRIVATE_KEY
signJWT(privateKey)
// privateKey accessible via memory dump

// 🟢 Use Buffer and zero after use
const keyBuf = Buffer.from(process.env.PRIVATE_KEY, 'utf8')
signJWT(keyBuf)
keyBuf.fill(0)  // zeroes the memory immediately

// Python
import ctypes, sys
def zero_memory(s):
    ctypes.memset(id(s), 0, sys.getsizeof(s))
```

### 8. Node.js Buffer Safety

```js
// 🔴 Exposes uninitialized heap memory
Buffer(userInput); // deprecated + dangerous
Buffer.allocUnsafe(userInput); // uninitialized memory
new Buffer(100); // deprecated

// 🟢 Always initialized
Buffer.alloc(100); // zeroed
Buffer.from(string, 'utf8'); // from known data

// 🔴 User-controlled size without limit
const buf = Buffer.alloc(req.body.size); // OOM if size=999999999
// 🟢 Validate size before allocation
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
if (req.body.size > MAX_SIZE) return res.status(400);
const buf = Buffer.alloc(req.body.size);
```

---

## Key Derivation

### 9. PBKDF2 / Argon2 for Password Hashing

```js
// 🔴 Raw hash — not suitable for passwords
sha256(password);

// 🟢 Key derivation functions with salt and iterations
bcrypt.hash(password, 12); // cost=12 minimum
argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 2 ** 16, // 64 MB
  timeCost: 3,
  parallelism: 1,
});
```

---

## Certificate Pinning (ASVS Level 3)

### 10. API Client Certificate Validation

```js
// For mobile clients / server-to-server calls
const agent = new https.Agent({
  ca: fs.readFileSync('ca-cert.pem'),
  checkServerIdentity: (host, cert) => {
    // Verify fingerprint matches expected
    const expected = process.env.API_CERT_FINGERPRINT;
    if (cert.fingerprint256 !== expected) {
      throw new Error('Certificate mismatch');
    }
  },
});
```

---

## Anti-Tampering (ASVS Level 3)

### 11. Code Integrity Verification

```js
// Verify critical files haven't been modified at startup
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

const EXPECTED_HASHES = {
  'middleware/auth.js': process.env.AUTH_MIDDLEWARE_HASH,
};
for (const [file, expectedHash] of Object.entries(EXPECTED_HASHES)) {
  const actual = createHash('sha256').update(readFileSync(file)).digest('hex');
  if (actual !== expectedHash) {
    logger.error(`TAMPERING DETECTED: ${file}`);
    process.exit(1);
  }
}
```
