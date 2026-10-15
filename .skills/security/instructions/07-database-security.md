# Database Security — Instruction 07

## Coverage

CWE-89, CWE-862, CWE-269 — Database security for all stacks
Firebase, Supabase, PostgreSQL, MySQL, MongoDB, Redis

---

## Firebase Security

### 1. Firestore Rules — Never Allow All

```javascript
// 🔴 CRITICAL — World-readable and writable
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;  // ANYONE can read/write EVERYTHING
    }
  }
}

// 🟢 CORRECT — Authentication required, ownership enforced
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /posts/{postId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == resource.data.authorId;
    }
  }
}
```

### 2. Firebase Storage Rules

```javascript
// 🔴 CRITICAL
allow read, write: if true;

// 🟢 CORRECT
match /users/{userId}/{allPaths=**} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
  allow read: if resource.size < 5 * 1024 * 1024;  // max 5MB reads
}
```

### 3. Firebase API Key Restrictions

- Firebase API key exposed in frontend JS = EXPECTED (it's public by design)
- BUT: restrict key in Firebase Console → API restrictions → specific APIs only
- Enable App Check for production

---

## Supabase Security

### 4. Row Level Security (RLS)

```sql
-- 🔴 CRITICAL — No RLS = all authenticated users see all data
-- Check if RLS is enabled on all tables:
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- 🟢 Enable RLS on every table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- 🟢 Add policies
CREATE POLICY "Users can only see their own data"
ON users FOR ALL
USING (auth.uid() = id);

CREATE POLICY "Authenticated users can read posts"
ON posts FOR SELECT
USING (auth.role() = 'authenticated');
```

### 5. Supabase Service Role Key

```
// 🔴 CRITICAL — Service role key bypasses ALL RLS!
SUPABASE_SERVICE_ROLE_KEY exposed in frontend code

// 🟢 Service role key = server-side ONLY
// Public key (anon key) = safe for frontend
// Service role key = NEVER in frontend code
```

---

## SQL (General)

### 6. Parameterized Queries

```js
// 🔴 SQL injection
const query = `SELECT * FROM users WHERE email = '${email}'`;

// 🟢 Parameterized
const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

// 🟢 ORM (auto-parameterized)
const user = await User.findOne({ where: { email } }); // Sequelize
const user = await prisma.user.findUnique({ where: { email } }); // Prisma
```

### 7. SQL Truncation Attack

```js
// 🔴 Long input truncated by DB may match existing user
// Validate string length BEFORE database insertion
if (username.length > 50) return res.status(400);
// Enable strict mode in MySQL: SET sql_mode = 'STRICT_TRANS_TABLES'
```

### 8. Least Privilege DB User

```
// 🔴 App using root/superuser DB account
DB_USER=root

// 🟢 Dedicated app user with minimal permissions
// CREATE USER 'appuser'@'%' IDENTIFIED BY 'strong_password';
// GRANT SELECT, INSERT, UPDATE, DELETE ON mydb.* TO 'appuser'@'%';
// NEVER GRANT: CREATE, DROP, ALTER, SUPER
```

### 9. DB Connection String Security

```
// 🔴 Credentials in code or public config
const db = new Pool({ connectionString: 'postgresql://root:password@localhost/mydb' })

// 🟢 Environment variables only
const db = new Pool({ connectionString: process.env.DATABASE_URL })
```

### 10. SSL for DB Connections

```js
// Production DB connection must use SSL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true }, // verify cert
});
```

### 11. Database Port Not Public

Check:

- PostgreSQL 5432 not exposed to internet
- MySQL 3306 not exposed to internet
- MongoDB 27017 not exposed to internet
  Use VPC/firewall rules to restrict to app servers only.

---

## MongoDB

### 12. MongoDB Authentication

```
// 🔴 No auth (default in some setups)
mongodb://localhost:27017/mydb

// 🟢 With auth
mongodb://appuser:password@localhost:27017/mydb?authSource=admin
```

### 13. NoSQL Injection

```js
// 🔴 User input directly in MongoDB query
User.find({ email: req.body.email });
// Attacker sends: { "$gt": "" } → returns ALL users

// 🟢 Validate and sanitize
const email = String(req.body.email); // force string
if (!isValidEmail(email)) return res.status(400);
User.find({ email });
```

---

## Redis

### 14. Redis Authentication

```
// 🔴 No password (common default)
// 🟢 requirepass in redis.conf
requirepass YourStrongPasswordHere

// 🔴 Redis exposed on 0.0.0.0
// 🟢 Bind to localhost only
bind 127.0.0.1
```

### 15. Sensitive Data Expiry in Redis

```js
// All cached sensitive data must have TTL
client.set('session:' + id, data, 'EX', 3600); // expires in 1 hour
// Never: client.set('session:' + id, data)  // no expiry
```

---

## PII in Database

### 16. Sensitive Field Encryption at Rest

```js
// Fields that MUST be encrypted before storage:
// creditCard, ssn, passport, bankAccount

// 🟢 Application-level encryption
const encrypted = encrypt(creditCard, process.env.ENCRYPTION_KEY);
await db.users.update({ creditCardEncrypted: encrypted });

// Never store in plaintext: password (hash), creditCard, SSN, bank info
```

### 17. Database Enumeration Prevention

```js
// 🔴 Error reveals DB schema
catch (err) {
  res.json({ error: err.message })  // "column 'email' does not exist"
}

// 🟢 Generic error to user, detailed to logs only
catch (err) {
  logger.error(err)  // full error in logs
  res.status(500).json({ error: 'Internal server error' })  // generic to user
}
```
