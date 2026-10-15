# Bot & DDoS Protection — Instruction 23

## Coverage

Bot detection, DDoS mitigation, Slowloris, amplification attacks
Rate limiting (advanced), honeypots, connection limits

---

## Rate Limiting (Advanced)

### 1. Multi-Layer Rate Limiting

```js
// Layer 1: Global rate limit (all requests)
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

// Layer 2: Per-endpoint strict limits
app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }));
app.post('/api/auth/register', rateLimit({ windowMs: 60 * 60 * 1000, max: 3 }));
app.post('/api/auth/forgot-password', rateLimit({ windowMs: 60 * 60 * 1000, max: 3 }));
app.post('/api/contact', rateLimit({ windowMs: 60 * 60 * 1000, max: 5 }));

// Layer 3: Per-user rate limit (not just per IP)
// Users behind the same proxy/NAT would share IP limit
app.use('/api', (req, res, next) => {
  const identifier = req.user?.id || req.ip;
  rateLimiter.consume(identifier).catch(() => {
    return res.status(429).json({ error: 'Too many requests' });
  });
});
```

### 2. Distributed Rate Limiting (Redis-backed)

```js
// 🔴 In-memory rate limiting fails with multiple server instances
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
// Each server has its own counter → attacker uses all servers

// 🟢 Redis-backed rate limiting (shared state)
import { RateLimiterRedis } from 'rate-limiter-flexible';
const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'middleware',
  points: 100, // max requests
  duration: 900, // per 15 minutes
  blockDuration: 60, // block for 1 min after limit hit
});
```

---

## Request Size & Timeout

### 3. Request Body Size Limits

```js
// 🔴 Unlimited body size = memory exhaustion
// 🟢 Strict limits by content type
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ limit: '10kb', extended: false }));

// For file uploads: multer with explicit limits (instruction 14)
// For APIs: 10KB-100KB is usually sufficient
```

### 4. Request Timeout

```js
// 🔴 No timeout = request holds server resources forever
// 🟢 Set server and middleware timeouts
import timeout from 'connect-timeout';
app.use(timeout('30s'));
app.use((req, res, next) => {
  if (req.timedout) return res.status(503).json({ error: 'Request timeout' });
  next();
});

// Node.js HTTP server timeout
server.setTimeout(30000); // 30 seconds
server.keepAliveTimeout = 65000;
```

---

## Slowloris Protection

### 5. Connection Timeouts (Nginx)

```nginx
# Slowloris sends partial headers slowly to hold connections open

client_header_timeout 10s;    # time to receive full headers
client_body_timeout 10s;      # time between body reads
send_timeout 10s;             # time between sends to client
keepalive_timeout 65s;        # keep-alive connection limit
```

### 6. Connection Limits per IP (Nginx)

```nginx
limit_conn_zone $binary_remote_addr zone=conn_limit_per_ip:10m;
limit_conn conn_limit_per_ip 20;    # max 20 concurrent connections per IP

limit_req_zone $binary_remote_addr zone=req_limit:10m rate=30r/m;
limit_req zone=req_limit burst=10 nodelay;
```

---

## Bot Detection

### 7. User-Agent Validation

```js
// 🔴 No user-agent check on sensitive endpoints
// 🟢 Basic bot detection
const BOT_PATTERNS = [
  /python-requests/i,
  /curl/i,
  /wget/i,
  /scrapy/i,
  /mechanize/i,
  /bot/i,
  /crawler/i,
  /spider/i,
  /headless/i,
];

app.use('/api/sensitive', (req, res, next) => {
  const ua = req.headers['user-agent'] || '';
  if (!ua || BOT_PATTERNS.some(p => p.test(ua))) {
    // Don't block blindly (legitimate tools use curl/requests)
    // But flag and rate-limit more strictly
    req.isSuspected = true;
  }
  next();
});

// Note: User-Agent can be spoofed — use as signal, not sole defense
```

### 8. Browser Fingerprint Checks

```js
// Missing typical browser headers = likely bot
app.use((req, res, next) => {
  const suspiciousSignals = [];

  if (!req.headers['accept-language']) suspiciousSignals.push('no-accept-language');
  if (!req.headers['accept']) suspiciousSignals.push('no-accept');
  if (req.headers['accept'] === '*/*') suspiciousSignals.push('wildcard-accept');

  if (suspiciousSignals.length >= 2) {
    req.botScore = (req.botScore || 0) + suspiciousSignals.length;
  }
  next();
});
```

---

## Amplification Attack Prevention

### 9. Response Size Proportional to Request

```js
// 🔴 Small request → huge response = amplification
// Example: GET /api/users → returns 10,000 users
app.get('/api/users', async (req, res) => {
  const users = await User.findAll(); // returns ALL users!
  res.json(users);
});

// 🟢 Always paginate large collections
app.get('/api/users', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const users = await User.findAll({ limit, offset: (page - 1) * limit });
  res.json({ users, page, limit, total: users.count });
});
```

---

## CAPTCHA Implementation

### 10. CAPTCHA on Sensitive Forms

```js
// Add CAPTCHA after N failed attempts or for sensitive operations
// Options: hCaptcha (privacy-friendly), Cloudflare Turnstile (free)

// Server-side CAPTCHA verification
app.post('/api/auth/login', async (req, res) => {
  if (req.body.captchaToken) {
    const verified = await verifyCaptcha(req.body.captchaToken);
    if (!verified) return res.status(400).json({ error: 'CAPTCHA failed' });
  }
  // ... login logic
});

// hCaptcha verification
async function verifyCaptcha(token) {
  const response = await fetch('https://hcaptcha.com/siteverify', {
    method: 'POST',
    body: new URLSearchParams({
      secret: process.env.HCAPTCHA_SECRET,
      response: token,
    }),
  });
  const data = await response.json();
  return data.success;
}
```

---

## DDoS Mitigation (Cloudflare)

### 11. Cloudflare Configuration Checklist (Guided)

```
// These require user action in Cloudflare dashboard:
// ☐ Under Attack Mode: enable if active DDoS
// ☐ WAF: enable managed rules (OWASP ruleset)
// ☐ Rate Limiting: configure in Cloudflare dashboard
// ☐ Bot Management: enable (paid plans)
// ☐ Browser Integrity Check: enable
// ☐ Challenge Passage: set to 30 minutes

// In code (Cloudflare Workers):
export default {
  async fetch(request, env) {
    // Cloudflare's CF-IPCountry header for geo-blocking
    const country = request.headers.get('CF-IPCountry')
    if (['CN', 'RU'].includes(country) && isHighRiskEndpoint(request.url)) {
      return new Response('Access restricted', { status: 403 })
    }
    return fetch(request)
  }
}
```
