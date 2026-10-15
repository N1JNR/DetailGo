# Secrets Management — Instruction 01

## Coverage

CWE-798 (Hard-coded Credentials), CWE-200 (Sensitive Info Exposure)
OWASP A02:2021, ASVS V6.4, V2.10

---

## Checks to Perform

### 1. .gitignore Completeness

Check that `.gitignore` exists and contains ALL of:

```
.env
.env.local
.env.development
.env.staging
.env.production
.env.*.local
*.key
*.pem
*.p12
*.pfx
*.cert
*.crt
secrets/
config/secrets*
.secrets
```

If `.gitignore` exists → append missing lines only (Level 3)
If `.gitignore` missing → create from template (Level 2)

### 2. .env.example Exists

- Check `.env.example` or `.env.sample` exists
- If `.env` exists but no `.env.example` → create `.env.example` with all keys, values replaced by placeholders
- Example: `STRIPE_SECRET_KEY=sk_live_abc123` → `STRIPE_SECRET_KEY=your_stripe_secret_key_here`
- Never include real values in `.env.example`

### 3. .env Not Committed

Run: `git ls-files | grep -E "\.env"`
If any `.env` file appears → CRITICAL issue
Instructions: add to `.gitignore`, then `git rm --cached .env`

### 4. Hardcoded Secrets in Code

Scan ALL source files for patterns:

```regex
# API Keys patterns
(?i)(api[_-]?key|apikey)\s*[=:]\s*['"][a-zA-Z0-9_\-]{10,}['"]
(?i)(secret[_-]?key|secretkey)\s*[=:]\s*['"][a-zA-Z0-9_\-]{10,}['"]
(?i)(access[_-]?token)\s*[=:]\s*['"][a-zA-Z0-9_\-]{20,}['"]
(?i)(auth[_-]?token)\s*[=:]\s*['"][a-zA-Z0-9_\-]{20,}['"]

# Service-specific patterns
sk_live_[a-zA-Z0-9]{24,}        # Stripe live key
sk_test_[a-zA-Z0-9]{24,}        # Stripe test key
AKIA[0-9A-Z]{16}                 # AWS Access Key
AIza[0-9A-Za-z\-_]{35}          # Google API Key
ghp_[a-zA-Z0-9]{36}             # GitHub Personal Token
ghs_[a-zA-Z0-9]{36}             # GitHub Actions Token
xoxb-[0-9]{11}-[0-9a-z]{24}     # Slack Bot Token
SG\.[a-zA-Z0-9_\-]{22}\.[a-zA-Z0-9_\-]{43}  # SendGrid
sq0atp-[0-9A-Za-z\-_]{22}       # Square Access Token
AC[a-z0-9]{32}                  # Twilio Account SID
SK[a-z0-9]{32}                  # Twilio Auth Token
eyJ[a-zA-Z0-9_-]{10,}\.eyJ     # JWT token hardcoded

# High entropy strings (potential secrets)
# String > 20 chars with mixed case + numbers + special chars in assignment
```

Exclude: `node_modules/`, `.git/`, `*.test.*`, `*.spec.*`, `*.example`, `*.sample`

### 5. Secrets in Comments

```regex
(?i)#\s*(password|pwd|passwd|secret|key|token|api[_-]?key)\s*[=:]\s*\S+
(?i)\/\/\s*(password|pwd|secret|key|token)\s*[=:]\s*\S+
(?i)<!--.*?(password|secret|key|token).*?-->
```

### 6. Backup Files with Secrets

Check for:

```
*.bak, *.backup, *.old, *.orig, *.copy
database.sql, dump.sql, backup.sql
config.bak, settings.bak
```

### 7. Pre-commit Hook Setup

Check if `.git/hooks/pre-commit` exists with secret scanning.
If not → create (Level 2):

```bash
#!/bin/sh
# Security skill - pre-commit secret scan
if command -v gitleaks &> /dev/null; then
  gitleaks protect --staged --config .gitleaks.toml
else
  # Fallback: basic grep scan
  if git diff --cached | grep -E "(password|secret|api_key|apikey)\s*=\s*['\"][^'\"]{8,}['\"]" -i; then
    echo "❌ Potential secret detected in staged files. Please review."
    exit 1
  fi
fi
```

### 8. gitleaks.toml Config

If using gitleaks → check `.gitleaks.toml` exists
If not → create from template (Level 2)

### 9. Source Maps in Production

Check build config for source map exposure:

- Next.js: `productionBrowserSourceMaps: false` (default)
- Webpack: `devtool: false` in production
- Vite: `build.sourcemap: false` in production

### 10. Git History Scan

Run:

```bash
git log --all --full-diff -p -- '*.env' '*.key' '*.pem' 2>/dev/null | grep -E "^\+" | grep -iE "(password|secret|api_key|token)" | head -20
```

If output found → CRITICAL — secrets may exist in git history

---

## Fixes

### Level 2 — Create .gitignore

Use template: `templates/gitignore/[stack].gitignore`

### Level 3 — Append to existing .gitignore

Add only missing entries from template

### Level 4 — Remove hardcoded secret

Show before/after:

```
Before: const API_KEY = "sk_live_abc123"
After:  const API_KEY = process.env.API_KEY

Also add to .env: API_KEY=sk_live_abc123
Also add to .env.example: API_KEY=your_api_key_here
```

Ask confirmation before applying.

### Level 5 — Clean git history

If secret found in git history:

1. IMMEDIATELY revoke/rotate the credential at the provider
2. Instructions for git-filter-repo (requires user to run manually):

```bash
pip install git-filter-repo
git filter-repo --invert-paths --path .env
git push --force --all
```

3. Notify all collaborators to re-clone

---

## Rotation Tracking

Update `memory-security.md` with detected secrets and their rotation status.
Flag any secret not rotated in > `rotation_reminder_days` (default: 90 days).
