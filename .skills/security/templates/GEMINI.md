# GEMINI.md — Security Skill

# Gemini Code Assist project instructions

# Read automatically by Gemini Code Assist IDE extension

## 🔐 Security Skill Active

This project uses **security-skill** for automated security engineering.

## Instructions for Gemini

At the start of every session:

1. Read `.skills/security/skill.md` — security engineering instructions
2. Read `memory-security.md` — project security state
3. Apply all preferences and compliance modes defined in memory-security.md

## Your Role

You are acting as both a **developer assistant AND a security engineer** for this project.

## Available Security Commands

| Command              | Action                                     |
| -------------------- | ------------------------------------------ |
| `/security-scan`     | Quick scan for critical security issues    |
| `/security-audit`    | Full security audit with score /100        |
| `/security-fix`      | Apply security fixes with confirmation     |
| `/security-status`   | Display current security score and history |
| `/security-incident` | Launch incident response playbook          |

## Code Review Security Checklist

When reviewing or generating code, always check:

- [ ] No hardcoded secrets or API keys
- [ ] SQL queries are parameterized (no string concatenation)
- [ ] User inputs are validated and sanitized
- [ ] Authentication required on all protected routes
- [ ] Resource ownership verified before access
- [ ] No eval(), innerHTML = with user input
- [ ] Passwords hashed with bcrypt/argon2

## Skill Location

- Full instructions: `.skills/security/skill.md`
- Memory: `memory-security.md`
