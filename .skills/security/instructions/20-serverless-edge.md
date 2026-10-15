# Serverless & Edge Functions — Instruction 20

## Coverage

Vercel Functions, AWS Lambda, Cloudflare Workers, Netlify Functions
OWASP Serverless Top 10

---

## Serverless General Checks

### 1. Function Timeout Configuration

```js
// 🔴 No timeout = function runs forever (cost + DoS risk)
// 🟢 Always set explicit timeout
// vercel.json:
{
  "functions": {
    "api/**/*.js": {
      "maxDuration": 10,  // 10 seconds max
      "memory": 512       // 512MB max
    }
  }
}
// AWS Lambda: set timeout in configuration (recommended: 30s max for API)
```

### 2. Cold Start Sensitive Data in Logs

```js
// 🔴 Logging sensitive data during initialization (visible in cold start logs)
const DB_URL = process.env.DATABASE_URL;
console.log('Connecting to:', DB_URL); // URL with credentials in logs!

// 🟢 Never log connection strings or secrets
console.log('Connecting to database...'); // generic message only
```

### 3. Event/Request Injection

```js
// 🔴 Trusting event data without validation
// Lambda:
exports.handler = async event => {
  const userId = event.pathParameters.userId;
  const data = await db.query(`SELECT * FROM users WHERE id = ${userId}`);
  // SQL injection if userId is "1 OR 1=1"!
};

// 🟢 Validate all event inputs
exports.handler = async event => {
  const userId = parseInt(event.pathParameters?.userId);
  if (!userId || isNaN(userId)) return { statusCode: 400, body: 'Invalid ID' };
  const data = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
};
```

### 4. Shared Execution Context (Warm Container)

```js
// 🔴 CRITICAL — Variables at module scope persist between invocations
// In the SAME container/instance serving multiple requests!

let userCache = {}; // 🔴 Shared between ALL requests on this container

exports.handler = async event => {
  userCache[event.userId] = sensitiveData; // LEAKS to next request!
};

// 🟢 Use request-scoped variables only
exports.handler = async event => {
  const requestCache = {}; // new object per invocation
  // ... use requestCache locally
};
```

---

## Vercel Functions

### 5. Middleware Security

```js
// middleware.ts — applies to ALL routes
import { NextResponse } from 'next/server';
export function middleware(request) {
  // Add security headers to all responses
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  return response;
}
```

### 6. Edge Runtime Limitations

```js
// Edge runtime has restrictions:
// 🔴 Can't use Node.js crypto module (use Web Crypto API)
// 🔴 Can't use fs module (no file system)
// 🔴 Limited npm packages

// 🟢 Edge-compatible crypto
const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
  'encrypt',
  'decrypt',
]);
```

---

## AWS Lambda

### 7. IAM Role — Least Privilege

```json
// 🔴 Lambda function with AdministratorAccess
// 🟢 Only the permissions the function actually needs
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:PutItem"],
      "Resource": "arn:aws:dynamodb:us-east-1:*:table/MyTable"
    }
  ]
}
```

### 8. Lambda Environment Variables

```
// 🔴 Secrets as plain env vars are stored in Lambda config (somewhat exposed)
// 🟢 Use AWS Secrets Manager or Parameter Store for sensitive values
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager"
const client = new SecretsManagerClient()
const secret = await client.send(new GetSecretValueCommand({ SecretId: 'MySecret' }))
```

### 9. Function URL / API Gateway Security

```
// 🔴 Lambda function URL with no auth
// 🟢 Require auth:
// - API Gateway: use authorizer (JWT, Cognito, Lambda authorizer)
// - Lambda URL: set authType to 'AWS_IAM' if internal
// - Always: validate the calling identity
```

---

## Cloudflare Workers

### 10. Wrangler Config Security

```toml
# wrangler.toml
[vars]
# 🔴 Never put secrets here
API_KEY = "secret"  # committed to git!

# 🟢 Use secrets via CLI
# wrangler secret put API_KEY
```

### 11. KV and Durable Objects Access Control

```js
// 🔴 KV/DO without user-level access control
// 🟢 Always scope data by user
const userData = await env.KV.get(`user:${userId}:data`);
// Never: await env.KV.get('all-users-data')
// Never: allow one user to construct keys for another user's data
```

---

## Netlify Functions

### 12. Function Authentication

```js
// netlify/functions/secure-api.js
exports.handler = async event => {
  // 🔴 No auth check
  // 🟢 Verify Netlify Identity token or custom JWT
  const token = event.headers.authorization?.replace('Bearer ', '');
  if (!token) return { statusCode: 401, body: 'Unauthorized' };
  const user = verifyToken(token);
  if (!user) return { statusCode: 401, body: 'Invalid token' };
};
```

---

## General Serverless Best Practices

### 13. No Persistent Connections Without Pooling

```js
// 🔴 Creating new DB connection per invocation (cold start cost + connection exhaustion)
exports.handler = async (event) => {
  const db = await createConnection()  // new connection every time!
  const result = await db.query(...)
  await db.end()
}

// 🟢 Use connection pooling or PgBouncer
// Or use serverless-friendly DBs: PlanetScale, Neon, Turso, Supabase
```

### 14. Serverless Injection via Environment

```js
// 🔴 User input used to access environment variables
const envVar = process.env[req.query.key]; // arbitrary env var access!
// Attacker: key=AWS_SECRET_ACCESS_KEY → returns your credentials

// 🟢 Never use user input to access env vars
```
