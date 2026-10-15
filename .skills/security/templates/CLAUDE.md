# 🔐 Security Skill Active

This project uses **security-skill** for automated security scanning and remediation.

## How to Use

Run any of these commands in your AI chat:

| Command                    | Action                                   |
| -------------------------- | ---------------------------------------- |
| `/security-scan`           | Quick scan — critical issues only (~30s) |
| `/security-audit`          | Full audit + security score /100         |
| `/security-fix`            | Apply fixes with confirmation            |
| `/security-status`         | Current score and history                |
| `/security-incident`       | Incident response playbook               |
| `/security-explain [rule]` | Explain a security rule                  |

## Skill Location

All skill instructions are in: `.skills/security/skill.md`
Security memory/state: `memory-security.md`

## Auto-Load Instructions

**At the start of every session, you MUST:**

1. Read `.skills/security/skill.md` — your security engineering instructions
2. Read `memory-security.md` — project security state and history
3. Apply all user preferences defined in memory
4. Be ready to respond to any `/security-*` command

You are now acting as both a developer assistant AND a security engineer for this project.
