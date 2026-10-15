# Monitoring & Detection — Instruction 19

## Coverage

Honeytokens, security.txt, logging, anomaly detection, secret rotation
ASVS V7, ASVS Level 3 behavioral monitoring

---

## Honeytokens

### 1. Deploy Canary Credentials

```js
// Honeytokens: fake credentials that alert you when accessed
// If someone finds and uses them → you know there's a breach

// 🟢 Create fake AWS keys at canarytokens.org (free)
// Place them in a plausible location:
// .env.backup, config/old-settings.js, README.old.md

// Example in .env.backup (honeypot file):
STRIPE_SECRET = sk_live_HONEYPOT_xyz123;
AWS_ACCESS_KEY_ID = AKIAIOSFODNN7HONEYPOT;
AWS_SECRET_ACCESS_KEY = wJalrXUtnFEMI / HONEYPOT / bPxRfiCYEXAMPLEKEY;

// When attacker tries to use these → you receive an alert email
// Source: https://canarytokens.org
```

### 2. Honeytoken in Database

```js
// Create fake admin account that should never be used
await User.create({
  email: 'admin-backup@yourdomain.com', // never used in real ops
  role: 'admin',
  isHoneytoken: true,
});
// If this account is accessed → alert immediately
User.findOne({ email }).then(user => {
  if (user?.isHoneytoken) {
    securityAlert('Honeytoken accessed!', { email, ip: req.ip });
  }
});
```

### 3. Honeypot Form Fields

```html
<!-- Honeypot field to detect bots -->
<form>
  <input type="text" name="name" required />
  <input type="email" name="email" required />
  <!-- Honeypot: hidden from real users, bots fill it in -->
  <input type="text" name="website" style="display:none" tabindex="-1" autocomplete="off" />
  <button type="submit">Submit</button>
</form>
```

```js
// Server-side: reject if honeypot field is filled
app.post('/contact', (req, res) => {
  if (req.body.website) {
    // real user won't fill this hidden field
    return res.status(200).json({ ok: true }); // fake success, discard
  }
  processForm(req.body);
});
```

---

## security.txt

### 4. security.txt File

```
// Check if /.well-known/security.txt exists
// RFC 9116 standard — allows security researchers to report vulnerabilities

// 🔴 Missing → researchers don't know how to report issues
// 🟢 Create (Level 2):
```

Content for `.well-known/security.txt`:

```
Contact: mailto:security@yourdomain.com
Expires: 2027-01-01T00:00:00.000Z
Preferred-Languages: en, fr
Policy: https://yourdomain.com/security-policy
Acknowledgments: https://yourdomain.com/hall-of-fame
```

---

## Structured Logging

### 5. Security Event Logging

```js
// 🔴 No security logging = blind to attacks
// 🟢 Log all security events (without PII)

const securityLog = {
  // Authentication events
  loginSuccess: (userId, ip) => logger.info({ event: 'auth.login_success', userId, ip }),
  loginFailure: (email, ip, reason) => logger.warn({ event: 'auth.login_failure', ip, reason }),
  // Never log the email itself in high-GDPR contexts

  // Authorization events
  accessDenied: (userId, resource, ip) =>
    logger.warn({ event: 'authz.denied', userId, resource, ip }),

  // Suspicious events
  rateLimitHit: (ip, endpoint) => logger.warn({ event: 'security.rate_limit', ip, endpoint }),
  invalidToken: (ip, endpoint) => logger.warn({ event: 'security.invalid_token', ip, endpoint }),
  scanDetected: (ip, pattern) => logger.error({ event: 'security.scan_detected', ip, pattern }),
};
```

### 6. Error Logging Without Exposure

```js
// 🔴 Stack traces sent to client
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message, stack: err.stack })  // 🔴

// 🟢 Log full error server-side, generic message to client
app.use((err, req, res, next) => {
  const errorId = crypto.randomUUID()
  logger.error({ errorId, err, url: req.url, method: req.method })
  res.status(500).json({ error: 'Internal server error', errorId })
  // errorId lets you find the log entry without exposing details
})
```

---

## Anomaly Detection (ASVS Level 3)

### 7. Behavioral Monitoring Middleware

```js
// Track request patterns to detect attacks
const requestTracker = new Map(); // Use Redis in production

app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const window = 60 * 1000; // 1 minute window

  if (!requestTracker.has(ip)) {
    requestTracker.set(ip, { count: 0, endpoints: new Set(), firstSeen: now });
  }

  const tracker = requestTracker.get(ip);
  tracker.count++;
  tracker.endpoints.add(req.path);

  // Detect endpoint scanning (many different endpoints from one IP)
  if (tracker.endpoints.size > 30 && now - tracker.firstSeen < window) {
    logger.warn({ event: 'security.scan_detected', ip, endpoints: tracker.endpoints.size });
  }

  // Log for SIEM analysis
  logger.info({ event: 'request', ip, path: req.path, method: req.method, userId: req.user?.id });

  next();
});
```

---

## Secret Rotation Tracking

### 8. Rotation Reminders

```js
// Track in memory-security.md and alert when rotation is due
// Check on every /security-status command:

function checkRotationStatus(memory) {
  const now = Date.now();
  const rotationDays = memory.rotation_reminder_days || 90;

  for (const [secretName, info] of Object.entries(memory.secrets || {})) {
    const lastRotated = new Date(info.last_rotated).getTime();
    const daysSince = (now - lastRotated) / (1000 * 60 * 60 * 24);

    if (daysSince > rotationDays) {
      console.warn(`⚠️  SECRET ROTATION DUE: ${secretName} (${Math.round(daysSince)} days)`);
    }
  }
}
```

---

## Directory Listing

### 9. Disable Directory Listing

```js
// 🔴 Web server lists files in directories without index
// → Exposes file structure, potential sensitive files

// Express: never use without explicit index
app.use(express.static('public', { index: false }));
// Better: use explicit routes for files

// Nginx:
// autoindex off;  (this is the default, verify it's not enabled)

// Next.js: no directory listing by default ✅
```

---

## Incident Alerting

### 10. Real-Time Security Alerts

```js
// Implement alerts for critical security events
async function securityAlert(event, data) {
  // Option 1: Email
  await sendEmail({
    to: process.env.SECURITY_EMAIL,
    subject: `🚨 SECURITY: ${event}`,
    body: JSON.stringify(data),
  });

  // Option 2: Slack webhook
  await fetch(process.env.SLACK_SECURITY_WEBHOOK, {
    method: 'POST',
    body: JSON.stringify({ text: `🚨 SECURITY EVENT: ${event}\n${JSON.stringify(data)}` }),
  });

  // Log as critical regardless
  logger.error({ event: 'security.alert', alertType: event, ...data });
}

// Trigger on:
// - Honeytoken accessed
// - Multiple auth failures (> 10 in 5 min)
// - Admin route accessed from new IP
// - Database error suggesting injection attempt
// - File outside allowed path accessed
```
