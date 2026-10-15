# Scoring System — Instruction 26

## Purpose

Calculate and display the security score, generate the full audit report.

---

## Score Calculation

### Formula

```
Base score = 100
For each issue found:
  - Critical: -20 points
  - High:     -10 points
  - Medium:   -5 points
  - Low:      -2 points
  - Info:     -0 points
Minimum score = 0
```

### Category Weights

Each category has a max score. The final score is weighted:

```
01. Secrets & Files           → weight 8%
02. Network & CORS            → weight 5%
03. HTTP Headers              → weight 5%
04. Auth & Sessions           → weight 8%
05. Cryptography              → weight 6%
06. JWT (deep)                → weight 5%
07. Database Security         → weight 7%
08. Deployment & Cloud        → weight 5%
09. Docker & Containers       → weight 3%
10. Protocols                 → weight 3%
11. Advanced Attacks          → weight 7%
12. Injections                → weight 6%
13. Race Conditions           → weight 4%
14. File Upload               → weight 3%
15. DNS & Email               → weight 3%
16. Supply Chain              → weight 5%
17. Mobile                    → weight 2%
18. Compliance & GDPR         → weight 4%
19. Monitoring & Detection    → weight 3%
20. Serverless & Edge         → weight 2%
21. Source Code Analysis      → weight 7%
22. AI/LLM Security           → weight 3%
23. Bot & DDoS                → weight 3%
24. Browser APIs              → weight 2%
25. Advanced Security (L3)    → weight 2%
```

For non-applicable categories (stack not detected), redistribute their weight evenly.

---

## Score Display (Chat)

Always show this after scan or audit:

```
╔══════════════════════════════════════════════════╗
║        SECURITY SCORE : [X]/100  [emoji]          ║
╠══════════════════════════════════════════════════╣
║  [emoji] Secrets & Files          [X]/100         ║
║  [emoji] Network & CORS           [X]/100         ║
║  [emoji] HTTP Headers             [X]/100         ║
║  [emoji] Auth & Sessions          [X]/100         ║
║  [emoji] Cryptography             [X]/100         ║
║  [emoji] Database Security        [X]/100         ║
║  [emoji] Source Code Analysis     [X]/100         ║
║  ... (show all applicable categories)             ║
╚══════════════════════════════════════════════════╝
  📈 Previous score: [X]/100 ([N] days ago)
  🔴 [N] critical | 🟠 [N] high | 🟡 [N] medium | 🔵 [N] low
  📄 Full report: security-report.md
```

Emoji per score range:

- 90-100: 🟢
- 70-89: 🟡
- 50-69: 🟠
- 0-49: 🔴

---

## Full Audit Report Format

Save as `security-report.md` in project root.
If file already exists → overwrite (it's a generated report).

````markdown
# 🔐 Security Audit Report

**Date:** [ISO date]
**Score:** [X]/100 [emoji]
**Project:** [project name from package.json or folder name]
**Stacks:** [detected stacks]
**Audited by:** security-skill v1.0.0

---

## 📊 Score Breakdown

| Category        | Score   | Issues                 |
| --------------- | ------- | ---------------------- |
| Secrets & Files | [X]/100 | [N] critical, [N] high |
| ...             |         |                        |

---

## 🔴 Critical Issues — Fix Immediately

### [Issue Name] (CWE-XXX)

**File:** `path/to/file.js` line [N]
**Problem:** [Clear explanation of the vulnerability]
**Risk:** [What an attacker could do]
**Fix:**

```[language]
// Before (vulnerable)
[code]

// After (secure)
[code]
```
````

**References:** [OWASP/CWE link]

---

## 🟠 High Issues

[same format]

---

## 🟡 Medium Issues

[same format]

---

## 🔵 Low / Info

[brief list]

---

## ✅ What's Secure

- [List of passing checks]

---

## 📋 Accepted Risks

[Risks from memory-security.md that were skipped]

---

## 🔄 Secrets Rotation Status

| Secret        | Last Rotated | Status              |
| ------------- | ------------ | ------------------- |
| STRIPE_SECRET | 90 days ago  | ⚠️ Due for rotation |

---

## 📅 Next Steps

1. [Most critical fix]
2. [Second most critical]
3. ...

Run `/security-fix` to apply fixes automatically (with confirmations).

```

---

## Quick Scan Format (Chat only)

For `/security-scan`, output in chat only (no file):

```

⚡ QUICK SCAN RESULTS
─────────────────────────────────────────
Score: [X]/100 [emoji]

🔴 CRITICAL ([N] found):
• [Issue 1] → [file:line]
• [Issue 2] → [file:line]

🟠 HIGH ([N] found):
• [Issue 1] → [file:line]

✅ No medium/low issues found

Run /security-audit for full report with all details.
Run /security-fix to start fixing.
─────────────────────────────────────────

```

---

## Token Optimization

- `/security-scan` → Chat output only, no file creation, minimal output
- `/security-audit` → Full report in file, minimal chat (just score + summary)
- Never repeat the same issue multiple times in a report
- Group similar issues together
- Use file references instead of quoting full code blocks when code is long
```
