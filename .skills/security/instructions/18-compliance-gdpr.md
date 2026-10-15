# Compliance & GDPR — Instruction 18

## Coverage

GDPR/RGPD, HIPAA, PCI-DSS, SOC2 — PII detection and compliance
CWE-200, CWE-312, ASVS V8

---

## PII Detection

### 1. PII Patterns in Code

Scan for these patterns being passed to:

- Logs, API responses, localStorage, cookies

```js
// PII fields to track:
user.email; // GDPR: requires consent, cannot be logged
user.phone; // GDPR: sensitive
user.firstName; // GDPR: personal data
user.lastName; // GDPR: personal data
user.birthDate; // GDPR: sensitive
user.address; // GDPR: sensitive
user.ip; // GDPR: personal data
user.password; // CRITICAL: never log, never return
user.ssn; // HIPAA/US: critical
user.creditCard; // PCI-DSS: never store unencrypted
user.cvv; // PCI-DSS: NEVER store (even encrypted)
user.bankAccount; // Sensitive: encrypt at rest
user.passport; // GDPR: sensitive
user.healthData; // HIPAA: critical
```

### 2. PII Not in Logs

```js
// 🔴 GDPR violation — PII in server logs
logger.info('User login', { email: user.email, ip: req.ip });
logger.error('Failed payment', { creditCard: card.number });

// 🟢 Log minimal, non-identifying data
logger.info('User login', { userId: user.id, timestamp: Date.now() });
logger.error('Failed payment', { userId: user.id, last4: card.last4 });

// 🟢 If logging IP (for security) — document legal basis
// IP is personal data under GDPR
```

### 3. PII Not in API Responses

```js
// 🔴 Password hash in API response
res.json({ user }); // user object contains passwordHash!

// 🟢 Exclude sensitive fields
const { passwordHash, ...safeUser } = user;
res.json({ user: safeUser });

// 🟢 Or use field projection
const user = await User.findById(id).select('-passwordHash -internalNotes');
```

### 4. PII Not in URLs

```
// 🔴 GDPR: URLs logged by servers, proxies, browsers
GET /users/search?email=john@example.com  // email in server logs
GET /profile?ssn=123456789               // SSN in URL!

// 🟢 PII via POST body or header only
POST /users/search
Body: { "email": "john@example.com" }
```

---

## GDPR Checks

### 5. Data Minimization

```js
// 🔴 Collecting more data than needed
await User.create({
  email: req.body.email,
  phone: req.body.phone, // needed?
  birthDate: req.body.birthDate, // needed?
  gender: req.body.gender, // needed?
  address: req.body.address, // needed?
});

// 🟢 Collect only what's strictly necessary
// Document why each field is collected (in privacy policy)
```

### 6. Data Retention

```js
// 🔴 Data kept forever
// 🟢 Define and enforce retention periods
// Example: inactive accounts → anonymize after 2 years
// Delete: logs after 90 days, sessions after 30 days

// Check if there are scheduled jobs for data cleanup
// Check if there's a privacy policy with retention periods
```

### 7. Right to Erasure

```js
// 🔴 No delete functionality — GDPR violation
// 🟢 Implement user data deletion
app.delete('/api/users/me', auth, async (req, res) => {
  // Delete or anonymize user data
  await User.findByIdAndUpdate(req.user.id, {
    email: `deleted_${Date.now()}@deleted.com`,
    name: 'Deleted User',
    // ... anonymize all PII
    deletedAt: new Date(),
  });
  // Delete: sessions, orders (or anonymize), reviews, logs
  res.json({ message: 'Account deleted' });
});
```

### 8. Consent Management

```js
// 🔴 Cookies set without consent
document.cookie = '_ga=...'; // analytics without consent

// 🟢 Implement consent before any non-essential cookies
// Check: is there a cookie consent banner?
// Check: are analytics/marketing cookies set only after consent?
// Check: is consent stored and respected?
```

### 9. Privacy Policy

- Check if `privacy-policy` route/page exists
- Check if terms-of-service exists
- Flag if missing (info)

---

## HIPAA (if healthcare data detected)

### 10. HIPAA-Specific Requirements

Detected when: medical, health, patient, diagnosis, prescription in codebase

```js
// HIPAA Technical Safeguards:
// ✅ Encryption in transit (TLS 1.2+) — already checked
// ✅ Encryption at rest for PHI
// ✅ Access controls (auth) — already checked
// ✅ Audit logs for all PHI access
// ✅ Automatic logoff (session timeout)
// ✅ Unique user identification
// ✅ Emergency access procedure

// Check audit logging for PHI access:
app.use('/api/patients', auth, (req, res, next) => {
  hipaaLogger.info({
    userId: req.user.id,
    action: req.method,
    resource: 'patient_data',
    patientId: req.params.id,
    timestamp: new Date().toISOString(),
  });
  next();
});
```

---

## PCI-DSS (if payment processing detected)

### 11. Card Data Rules

Detected when: stripe, payment, card, checkout, billing in codebase

```js
// 🔴 CRITICAL PCI violations:
// Storing CVV (never, even encrypted)
// Storing full PAN (card number) without tokenization
// Logging card data

// 🟢 PCI-Compliant approach:
// Use Stripe/Braintree/Square tokenization — never handle raw card data
// Stripe.js collects card data directly in browser → Stripe servers
// You only receive a token

// Check:
// - Payment library used (Stripe, etc.)
// - No raw card numbers in your code/database
// - No CVV stored anywhere
// - HTTPS everywhere on payment pages (already checked)
```

---

## Data at Rest Encryption

### 12. Sensitive Fields Encrypted in Database

```js
// Fields that MUST be encrypted at rest:
// - creditCard (if stored, though you shouldn't)
// - ssn, passport, government ID
// - health/medical data
// - bank account numbers

// Application-level encryption (works with any DB)
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // 32 bytes

function encrypt(text) {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(data) {
  const [ivHex, tagHex, encryptedHex] = data.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}
```
