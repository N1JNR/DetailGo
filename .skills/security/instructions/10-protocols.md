# Protocols Security — Instruction 10

## Coverage

GraphQL, WebSocket, Webhooks, Server-Sent Events (SSE)
OWASP API Security Top 10

---

## GraphQL Security

### 1. Disable Introspection in Production

```js
// 🔴 Introspection in production = complete API map for attackers
// Default: enabled

// 🟢 Disable in production
const server = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: process.env.NODE_ENV !== 'production',
  playground: process.env.NODE_ENV !== 'production',
});
```

### 2. Query Depth Limiting

```js
// 🔴 Deeply nested query = DoS attack
query {
  user { friends { friends { friends { friends { id name } } } } }
}

// 🟢 Limit depth
import depthLimit from 'graphql-depth-limit'
const server = new ApolloServer({
  validationRules: [depthLimit(5)]
})
```

### 3. Query Complexity Limiting

```js
// 🔴 Complex query with many fields = DoS
// 🟢 Limit complexity score
import { createComplexityLimitRule } from 'graphql-validation-complexity';
const server = new ApolloServer({
  validationRules: [createComplexityLimitRule(1000)],
});
```

### 4. Field-Level Authorization

```js
// 🔴 Resolver without auth check
const resolvers = {
  Query: {
    adminUsers: () => User.findAll(), // no auth!
  },
};

// 🟢 Check auth in every sensitive resolver
const resolvers = {
  Query: {
    adminUsers: (_, __, { user }) => {
      if (!user || user.role !== 'admin') throw new ForbiddenError('Access denied');
      return User.findAll();
    },
  },
};
```

### 5. GraphQL Error Masking

```js
// 🔴 Internal errors exposed to clients
// ApolloServer default shows full error in development

// 🟢 Mask errors in production
const server = new ApolloServer({
  formatError: error => {
    if (process.env.NODE_ENV === 'production') {
      return new Error('Internal server error');
    }
    return error;
  },
});
```

### 6. GraphQL Batching Attacks

```js
// 🔴 Batched queries bypass rate limiting
[{ query: "{ user(id: 1) { id } }" }, ... x 1000]

// 🟢 Limit batch size
// apollo-server-express: batchingEnabled (disable or limit)
const server = new ApolloServer({ allowBatchedHttpRequests: false })
```

---

## WebSocket Security

### 7. WSS (WebSocket Secure) Only

```js
// 🔴 Unencrypted WebSocket in production
const ws = new WebSocket('ws://api.example.com');

// 🟢 Always WSS in production
const ws = new WebSocket('wss://api.example.com');
```

### 8. Origin Validation on Server

```js
// 🔴 Accepts WebSocket from any origin
// 🟢 Validate origin on upgrade
const wss = new WebSocket.Server({
  server,
  verifyClient: ({ origin, req }) => {
    const allowed = ['https://app.yourdomain.com'];
    return allowed.includes(origin);
  },
});
```

### 9. Authentication per WebSocket Connection

```js
// 🔴 No auth = anyone can connect
wss.on('connection', ws => {
  ws.on('message', handleMessage);
});

// 🟢 Authenticate on connection
wss.on('connection', (ws, req) => {
  const token = new URL(req.url, 'http://localhost').searchParams.get('token');
  const user = verifyToken(token);
  if (!user) return ws.close(1008, 'Unauthorized');
  ws.userId = user.id;
});
```

### 10. Message Validation

```js
// 🔴 Trust WebSocket message content blindly
ws.on('message', data => {
  const msg = JSON.parse(data);
  db.query(msg.sql); // 🔴 CRITICAL
});

// 🟢 Validate and sanitize every message
ws.on('message', data => {
  let msg;
  try {
    msg = JSON.parse(data);
  } catch {
    return ws.close(1003, 'Invalid data');
  }
  if (!isValidMessageSchema(msg)) return ws.close(1003, 'Invalid schema');
  handleValidMessage(msg);
});
```

### 11. WebSocket Rate Limiting

```js
// Track messages per connection, disconnect abusers
const msgCount = new Map();
ws.on('message', data => {
  const count = (msgCount.get(ws) || 0) + 1;
  msgCount.set(ws, count);
  if (count > 100) return ws.terminate(); // too many messages
});
```

### 12. WebSocket Timeout

```js
// Disconnect idle connections
const TIMEOUT = 5 * 60 * 1000; // 5 minutes
let pingTimeout;
ws.on('pong', () => clearTimeout(pingTimeout));
const interval = setInterval(() => {
  if (ws.readyState === ws.OPEN) {
    ws.ping();
    pingTimeout = setTimeout(() => ws.terminate(), 30000);
  }
}, 30000);
ws.on('close', () => clearInterval(interval));
```

---

## Webhook Security

### 13. HMAC Signature Verification

```js
// 🔴 No signature verification = anyone can trigger webhooks
app.post('/webhook', (req, res) => {
  processWebhook(req.body);
});

// 🟢 Always verify HMAC signature
import { createHmac, timingSafeEqual } from 'crypto';
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const expected = createHmac('sha256', process.env.WEBHOOK_SECRET).update(req.body).digest('hex');
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(`sha256=${expected}`))) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  processWebhook(JSON.parse(req.body));
});
```

### 14. Webhook Idempotency

```js
// 🔴 Processing duplicate webhooks = double charges, duplicate emails
// 🟢 Track and deduplicate
const processed = new Set(); // Use Redis in production
app.post('/webhook', (req, res) => {
  const eventId = req.headers['x-webhook-id'];
  if (processed.has(eventId)) return res.status(200).json({ ok: true });
  processed.add(eventId);
  processWebhook(req.body);
});
```

---

## Server-Sent Events (SSE)

### 15. SSE Authentication

```js
// 🔴 SSE without auth = anyone can subscribe to events
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  sendSensitiveData(res); // 🔴
});

// 🟢 Require auth
app.get('/events', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  sendUserSpecificEvents(res, req.user.id);
});
```

### 16. SSE Reconnection Limit

```js
// 🔴 Unlimited reconnections = DoS vector
// 🟢 Track and limit connections per user
const connections = new Map();
app.get('/events', requireAuth, (req, res) => {
  const userId = req.user.id;
  if ((connections.get(userId) || 0) >= 3) {
    return res.status(429).json({ error: 'Too many connections' });
  }
  connections.set(userId, (connections.get(userId) || 0) + 1);
  req.on('close', () => connections.set(userId, connections.get(userId) - 1));
});
```
