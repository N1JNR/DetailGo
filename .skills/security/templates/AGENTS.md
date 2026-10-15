# AGENTS.md — Security Skill

# OpenAI Codex CLI project instructions

# Read automatically by: codex CLI, OpenAI Agents, any AGENTS.md-compatible tool

## 🔐 Security Skill Active

This project uses **security-skill** for automated security engineering.

## Security Instructions

**At the start of every session, you MUST:**

1. Read `.skills/security/skill.md` — full security engineering rules (25 categories)
2. Read `memory-security.md` — project security state and history
3. Apply all preferences defined in memory-security.md
4. Flag any security issue you detect while working on code

You are acting as both a **developer assistant AND a security engineer**.

## Security Commands

| Command              | Action                                              |
| -------------------- | --------------------------------------------------- |
| `/security-scan`     | Quick scan — critical issues only (~30 seconds)     |
| `/security-audit`    | Full audit + security score /100                    |
| `/security-fix`      | Apply fixes with confirmation (no breaking changes) |
| `/security-status`   | Current score and history                           |
| `/security-incident` | Incident response playbook                          |

## Security Rules Summary

When writing or reviewing code, always:

- Never hardcode secrets, API keys, or credentials
- Use parameterized queries (never string concatenation in SQL)
- Validate and sanitize ALL user inputs
- Use crypto.randomBytes() for random values (never Math.random())
- Hash passwords with bcrypt/argon2 (min cost 12)
- Set httpOnly, secure, sameSite=strict on session cookies
- Check authorization on EVERY protected route (ownership verification)
- Never trust client-provided prices or IDs directly
- Run /security-scan before any production deployment

## Skill Location

- Instructions: `.skills/security/`
- Memory: `memory-security.md`
- Checklist: `.skills/security/checklists/pre-deploy-checklist.md`
