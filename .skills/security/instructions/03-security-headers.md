# Security Headers — Instruction 03

## Coverage

OWASP A05:2021, CWE-693, CWE-1021

---

## Required Headers

### 1. HSTS

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

### 2. Content Security Policy (CSP) + Nonces

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{RANDOM}'; style-src 'self' 'nonce-{RANDOM}'; img-src 'self' data: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';
```

Nonce per request:

```js
const nonce = crypto.randomBytes(16).toString('base64');
```

🔴 Never use `'unsafe-inline'` or `'unsafe-eval'`

### 3. X-Frame-Options

```
X-Frame-Options: DENY
```

### 4. X-Content-Type-Options

```
X-Content-Type-Options: nosniff
```

### 5. Referrer-Policy

```
Referrer-Policy: strict-origin-when-cross-origin
```

### 6. Permissions-Policy

```
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
```

### 7. COOP / COEP / CORP (Spectre mitigation)

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

### 8. Remove Fingerprinting Headers

```js
app.disable('x-powered-by'); // Express
// Nginx: server_tokens off;
```

Remove: `X-Powered-By`, `Server` version, `X-AspNet-Version`

### 9. Trusted Types (DOM XSS)

Add to CSP: `require-trusted-types-for 'script'`
Scan for: `innerHTML =`, `document.write()`, `outerHTML =`

### 10. Private Network Access

```
Access-Control-Allow-Private-Network: true
```

### 11. Sec-Fetch Validation

```js
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.headers['sec-fetch-site'] === 'cross-site') {
    return res.status(403).json({ error: 'Cross-site request blocked' });
  }
  next();
});
```

### 12. SRI for CDN Resources

```html
<script
  src="https://cdn.example.com/lib.js"
  integrity="sha384-[hash]"
  crossorigin="anonymous"
></script>
```

🔴 Flag any CDN resource without integrity hash

### 13. Clear-Site-Data on Logout

```js
res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');
```

### 14. Cache-Control per Page Type

```
Sensitive pages:  Cache-Control: no-store, no-cache, private
API user data:    Cache-Control: private, no-store
Static assets:    Cache-Control: public, max-age=31536000, immutable
Public pages:     Cache-Control: public, s-maxage=300
```

---

## Stack Templates

- Next.js → `templates/security-headers/next.config.js`
- Express → `templates/security-headers/express-helmet.js`
- Vercel → `templates/security-headers/vercel.json`
- Nginx → `templates/security-headers/nginx.conf`
- Cloudflare → `templates/security-headers/_headers`
