# Stack Detection — Instruction 00

## Purpose

Before any scan or audit, automatically detect all technologies used in the project.
Never ask the user what stack they use — detect it by reading the files.

---

## Detection Method

### Step 1 — Scan root files

```
package.json          → Node.js / JavaScript / TypeScript
requirements.txt      → Python
Pipfile               → Python (Pipenv)
pyproject.toml        → Python (Poetry)
composer.json         → PHP
go.mod                → Go
Gemfile               → Ruby
pom.xml               → Java (Maven)
build.gradle          → Java/Kotlin (Gradle)
Cargo.toml            → Rust
pubspec.yaml          → Dart/Flutter
```

### Step 2 — Detect framework

```
next.config.js / next.config.ts    → Next.js
nuxt.config.ts                     → Nuxt.js
svelte.config.js                   → SvelteKit
astro.config.mjs                   → Astro
vite.config.ts                     → Vite
angular.json                       → Angular
remix.config.js                    → Remix
gatsby-config.js                   → Gatsby
express (in package.json deps)     → Express.js
fastapi (in requirements.txt)      → FastAPI
django (in requirements.txt)       → Django
flask (in requirements.txt)        → Flask
laravel (in composer.json)         → Laravel
rails (in Gemfile)                 → Ruby on Rails
spring-boot (in pom.xml)           → Spring Boot
```

### Step 3 — Detect database/BaaS

```
firebase.json / .firebaserc         → Firebase
supabase/ directory                 → Supabase
prisma/ or schema.prisma            → Prisma ORM
mongoose in package.json            → MongoDB
sequelize in package.json           → SQL (Sequelize)
typeorm in package.json             → SQL (TypeORM)
redis in package.json               → Redis
```

### Step 4 — Detect deployment

```
vercel.json                         → Vercel
wrangler.toml                       → Cloudflare Workers/Pages
netlify.toml                        → Netlify
heroku.yml / Procfile               → Heroku
railway.json                        → Railway
render.yaml                         → Render
Dockerfile                          → Docker
docker-compose.yml                  → Docker Compose
.github/workflows/                  → GitHub Actions
.gitlab-ci.yml                      → GitLab CI
serverless.yml                      → Serverless Framework
```

### Step 5 — Detect special features

```
graphql/ or *.graphql files         → GraphQL
socket.io in package.json           → WebSockets
stripe in package.json              → Payment/Webhooks
openai/anthropic in package.json    → AI/LLM usage
react-native / expo in package.json → Mobile
manifest.json in public/            → PWA
wasm files                          → WebAssembly
```

### Step 6 — Detect environment

```
.env.local exists                   → Development environment
vercel.json + VERCEL env var        → Production on Vercel
NODE_ENV=production in config       → Production mode
```

---

## Output Format

After detection, always output:

```
🔍 Stack detected:
├── Language    : TypeScript / Node.js 20
├── Framework   : Next.js 14 (App Router)
├── Database    : Supabase + Redis
├── Deployment  : Vercel + Cloudflare CDN
├── CI/CD       : GitHub Actions
├── Special     : Stripe webhooks, OpenAI API
└── Environment : Production

Loading 18/25 security categories (7 not applicable)...
```

---

## Adaptive Rules

Only activate checks relevant to the detected stack:

- No Docker checks if no Dockerfile
- No Firebase checks if no firebase.json
- No mobile checks if no React Native/Expo
- No GraphQL checks if no GraphQL files
- No WebRTC checks if no WebRTC usage

This keeps scans fast and reports relevant.
