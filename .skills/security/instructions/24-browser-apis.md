# Browser APIs Security — Instruction 24

## Coverage

WebRTC, WebAssembly (WASM), PWA/Service Workers, IndexedDB, Web Workers, Push Notifications
Modern browser API security

---

## WebRTC Security

### 1. IP Leak via STUN

```js
// 🔴 STUN servers expose real IP even through VPN
const pc = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.googleapis.com:19302' }],
});
// Creates ICE candidates with real local + public IP

// 🟢 Force TURN relay to hide IPs
const pc = new RTCPeerConnection({
  iceServers: [
    {
      urls: 'turn:turn.yourdomain.com:3478',
      username: process.env.TURN_USER,
      credential: process.env.TURN_PASS,
    },
  ],
  iceTransportPolicy: 'relay', // force all traffic through TURN
});

// 🔴 STUN/TURN credentials in frontend code
const turnUser = 'hardcodedUser'; // 🔴

// 🟢 Short-lived TURN credentials from server
const { username, password } = await fetch('/api/turn-credentials').then(r => r.json());
// Server generates time-limited TURN credentials
```

### 2. TURN Server Authentication

```js
// 🔴 Open TURN server (no auth) = free relay for anyone
// Massive bandwidth costs + abuse

// 🟢 Time-limited HMAC credentials
// Server:
function generateTurnCredentials(userId) {
  const ttl = 86400; // 24 hours
  const timestamp = Math.floor(Date.now() / 1000) + ttl;
  const username = `${timestamp}:${userId}`;
  const password = crypto
    .createHmac('sha1', process.env.TURN_SECRET)
    .update(username)
    .digest('base64');
  return { username, password, ttl };
}
```

### 3. WebRTC Data Channel Security

```js
// 🔴 Sending sensitive data over data channels without application-level encryption
// WebRTC uses DTLS — encrypted in transit, but verify peer

// 🟢 Verify peer certificate fingerprint
pc.addEventListener('connectionstatechange', () => {
  if (pc.connectionState === 'connected') {
    const certStats = pc.getStats().then(stats => {
      // Verify peer fingerprint against expected
    });
  }
});
```

---

## WebAssembly (WASM)

### 4. Load WASM from Trusted Sources Only

```js
// 🔴 Loading WASM from user-controlled URL
const module = await WebAssembly.instantiateStreaming(fetch(userUrl));

// 🟢 WASM from fixed, trusted sources only
const module = await WebAssembly.instantiateStreaming(fetch('/static/app.wasm'));

// 🟢 CSP: control which WASM can be loaded
// Add to CSP if using WASM:
// script-src 'self' 'wasm-unsafe-eval'
```

### 5. Validate Inputs at JS/WASM Boundary

```js
// 🔴 Unvalidated input passed to WASM (may have internal buffer issues)
wasmModule.exports.processData(userInput); // WASM compiled from C may overflow

// 🟢 Validate length and type before passing to WASM
if (typeof userInput !== 'string' || userInput.length > MAX_INPUT_LENGTH) {
  throw new Error('Invalid input');
}
wasmModule.exports.processData(userInput);
```

---

## Service Workers

### 6. Minimal Service Worker Scope

```js
// 🔴 Service worker registered at root with broad scope
navigator.serviceWorker.register('/sw.js', { scope: '/' });
// SW intercepts ALL requests on the domain

// 🟢 Scope to specific path
navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' });
```

### 7. Never Cache Auth/Sensitive Requests

```js
// sw.js
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 🔴 Caching auth requests
  // 🟢 Never cache:
  if (
    url.pathname.startsWith('/api/auth') ||
    url.pathname.startsWith('/api/user') ||
    event.request.headers.has('Authorization')
  ) {
    // Always fetch fresh from network
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache only static assets
  if (url.pathname.match(/\.(js|css|png|jpg|svg|woff2)$/)) {
    event.respondWith(cacheFirst(event.request));
  }
});
```

### 8. SW Update Lifecycle

```js
// 🟢 Force update check to ensure security patches are applied
self.addEventListener('install', event => {
  self.skipWaiting(); // activate immediately
});
self.addEventListener('activate', event => {
  event.waitUntil(clients.claim()); // take control immediately
});
```

---

## IndexedDB Security

### 9. Encrypt Sensitive Data Before Storage

```js
// 🔴 Sensitive data in plaintext in IndexedDB
const db = await openDB('appDB', 1);
await db.put('users', { token: authToken, email: user.email }, 'current');
// Accessible via: dev tools, XSS, extensions

// 🟢 Encrypt before storing
const encrypted = await encryptWithWebCrypto(JSON.stringify({ token: authToken }), encryptionKey);
await db.put('secure', { data: encrypted }, 'current');

// 🟢 Or use SecureStorage alternatives
// For truly sensitive data: httpOnly cookies (not accessible to JS at all)
```

### 10. Clear IndexedDB on Logout

```js
// 🔴 Sensitive data persists after logout
// 🟢 Clear all sensitive data on logout
async function logout() {
  // Clear auth state
  await clearAuthCookies();
  // Clear indexed DB
  const db = await openDB('appDB');
  await db.clear('secure');
  await db.clear('users');
  // Clear storage
  localStorage.clear();
  sessionStorage.clear();
}
```

---

## Web Workers

### 11. No Sensitive Data in Worker Messages

```js
// 🔴 Passing API keys to workers
const worker = new Worker('/worker.js');
worker.postMessage({ apiKey: process.env.API_KEY }); // key accessible to worker

// 🟢 Workers should only receive data needed for computation
worker.postMessage({ data: arrayBuffer, config: { quality: 80 } });
```

### 12. Worker Source Validation

```js
// 🔴 Creating worker from user-controlled URL
const worker = new Worker(req.query.workerUrl); // code injection!

// 🟢 Workers from known, static paths only
const worker = new Worker('/static/workers/image-processor.js');
```

---

## Push Notifications (VAPID)

### 13. VAPID Key Security

```js
// 🔴 VAPID private key in frontend code
const vapidPrivateKey = 'xxxPrivateKeyHere'; // 🔴 NEVER in frontend

// 🟢 VAPID key split:
// Frontend: only vapidPublicKey (safe to expose)
const registration = await navigator.serviceWorker.ready;
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
});

// Backend: uses vapidPrivateKey to sign notifications
webpush.setVapidDetails('mailto:you@example.com', publicKey, process.env.VAPID_PRIVATE_KEY);
```

### 14. Push Subscription Endpoint Auth

```js
// 🔴 Push subscription endpoint not authenticated
app.post('/api/push/subscribe', (req, res) => {
  saveSubscription(req.body)  // no auth!

// 🟢 Require auth to save subscription
app.post('/api/push/subscribe', requireAuth, (req, res) => {
  saveSubscription(req.body, req.user.id)
})
```

---

## PWA Manifest Security

### 15. Manifest Security

```json
// manifest.json
{
  "name": "My App",
  "start_url": "/",
  "scope": "/app/", // 🟢 Restrict scope — don't control more than needed

  // 🔴 Icons from external CDN without SRI
  // "icons": [{ "src": "https://external.com/icon.png" }]

  // 🟢 Icons from same origin
  "icons": [{ "src": "/icons/icon-192.png", "sizes": "192x192" }],

  // 🟢 Display standalone — OK
  "display": "standalone"
}
```
