# Race Conditions & Business Logic — Instruction 13

## Coverage

CWE-362 (Race Condition / TOCTOU), CWE-190 (Integer Overflow), CWE-400
Business logic flaws, concurrency issues, resource consumption

---

## Race Conditions (TOCTOU)

### 1. Check-Then-Act Race Condition

```js
// 🔴 CRITICAL — Time gap between check and action
app.post('/redeem-coupon', async (req, res) => {
  const coupon = await db.coupon.findOne({ code: req.body.code });
  if (!coupon || coupon.used) return res.status(400).json({ error: 'Invalid coupon' });
  // ← RACE: another request checks here simultaneously — both pass!
  await db.coupon.update({ used: true }, { where: { code: req.body.code } });
  applyDiscount(req.user);
});

// 🟢 Atomic update — check AND update in one operation
const updated = await db.coupon.update(
  { used: true },
  { where: { code: req.body.code, used: false }, returning: true },
);
if (updated[0] === 0) return res.status(400).json({ error: 'Coupon already used' });
applyDiscount(req.user);
```

### 2. Database Transactions for Critical Operations

```js
// 🟢 Use transactions for multi-step financial operations
const t = await sequelize.transaction();
try {
  const account = await Account.findOne({ where: { id }, lock: true, transaction: t });
  if (account.balance < amount) throw new Error('Insufficient funds');
  await account.decrement('balance', { by: amount, transaction: t });
  await targetAccount.increment('balance', { by: amount, transaction: t });
  await t.commit();
} catch (err) {
  await t.rollback();
  throw err;
}
```

### 3. Distributed Lock for Critical Sections

```js
// 🟢 Redis-based distributed lock
import Redlock from 'redlock';
const redlock = new Redlock([redisClient]);

app.post('/purchase', async (req, res) => {
  const lock = await redlock.acquire([`lock:item:${req.body.itemId}`], 5000);
  try {
    const item = await Item.findById(req.body.itemId);
    if (item.stock <= 0) return res.status(400).json({ error: 'Out of stock' });
    await item.decrement('stock');
    await createOrder(req.user, item);
  } finally {
    await lock.release();
  }
});
```

---

## Integer Overflow (CWE-190)

### 4. Number Bounds Validation

```js
// 🔴 Negative quantities / integer overflow
app.post('/order', async (req, res) => {
  const total = price * req.body.quantity; // quantity = -1 → negative total!
  await chargeUser(req.user, total); // user gets refund?
});

// 🟢 Validate all numeric inputs
const quantity = parseInt(req.body.quantity, 10);
if (isNaN(quantity) || quantity <= 0 || quantity > 100) {
  return res.status(400).json({ error: 'Invalid quantity' });
}

// 🔴 Price from client (never trust)
const price = req.body.price; // attacker sends 0.001

// 🟢 Always fetch price from server-side
const item = await Item.findById(req.body.itemId);
const total = item.price * quantity; // server price, not client price
```

### 5. JavaScript Number Precision

```js
// 🔴 Floating point for money = precision errors
const total = 0.1 + 0.2; // → 0.30000000000000004

// 🟢 Integer arithmetic (cents) or BigInt
const totalCents = Math.round(priceInCents * quantity);
// Or use a money library like Dinero.js
```

---

## Business Logic Flaws

### 6. Coupon/Discount Stacking

```js
// 🔴 Multiple coupons applied (if not prevented)
// 🟢 Enforce one coupon per order at DB level
// Check: only one discount per cart, validated server-side
```

### 7. Order of Operations

```js
// 🔴 Processing payment before validating order integrity
await chargeCard(user, total); // charges first
if (!stockAvailable(item)) {
  // then checks stock
  // now need to refund — race condition possible
}

// 🟢 Validate EVERYTHING before charging
await validateStock(item);
await validatePrice(item, total);
await validateUser(user);
await chargeCard(user, total); // charge only if all validations pass
```

### 8. Bypass of Sequential Steps

```js
// 🔴 Direct access to step 3 without completing steps 1 and 2
app.post('/checkout/confirm', handler); // no check that /checkout/review was completed

// 🟢 Track workflow state server-side
if (!req.session.checkoutReviewed) {
  return res.status(400).json({ error: 'Please review order first' });
}
```

---

## Uncontrolled Resource Consumption (CWE-400)

### 9. User-Controlled Loop Iterations

```js
// 🔴 DoS via large iterations
for (let i = 0; i < req.body.count; i++) {
  await processItem(i); // count = 1000000 → server hangs
}

// 🟢 Hard limit
const MAX_COUNT = 1000;
const count = Math.min(parseInt(req.body.count) || 10, MAX_COUNT);
```

### 10. User-Controlled Recursion Depth

```js
// 🔴 Stack overflow via deep recursion
function process(node, depth = req.body.maxDepth) {
  if (depth <= 0) return;
  return process(node.child, depth - 1);
}
// depth = 100000 → stack overflow

// 🟢 Hard cap on depth
const MAX_DEPTH = 50;
const depth = Math.min(parseInt(req.body.maxDepth) || 10, MAX_DEPTH);
```

### 11. Memory Allocation from User Input

```js
// 🔴 OOM attack
const buffer = Buffer.alloc(req.body.size); // size = 2147483647

// 🟢 Limit allocation
const MAX_ALLOC = 10 * 1024 * 1024; // 10MB
if (req.body.size > MAX_ALLOC) return res.status(400);
const buffer = Buffer.alloc(req.body.size);
```

### 12. Unhandled Promise Rejections (CWE-476 in Node.js)

```js
// 🔴 Server crash = DoS
async function handler(req, res) {
  const data = await riskyOperation(); // throws → UnhandledPromiseRejection → crash
}

// 🟢 Always wrap async handlers
app.get('/path', async (req, res) => {
  try {
    const data = await riskyOperation();
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 🟢 Global safety net
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', reason);
  // Don't exit in production — just log
});
```

### 13. File Operations Without Size Limits

```js
// 🔴 Loading entire large file into memory
const content = fs.readFileSync(userProvidedPath); // 10GB file → OOM

// 🟢 Use streams for large files
const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
stream.pipe(res);
```
