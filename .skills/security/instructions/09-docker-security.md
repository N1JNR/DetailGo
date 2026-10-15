# Docker & Container Security — Instruction 09

## Coverage

OWASP Docker Top 10, CWE-269, CWE-732
Container hardening, image security, runtime security

---

## Dockerfile Checks

### 1. Never Run as Root

```dockerfile
# 🔴 CRITICAL — Container runs as root by default
FROM node:20
COPY . .
RUN npm install
CMD ["node", "app.js"]

# 🟢 Create dedicated non-root user
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs
EXPOSE 3000
CMD ["node", "app.js"]
```

### 2. No Secrets in Dockerfile / Image Layers

```dockerfile
# 🔴 CRITICAL — Secrets baked into layers forever
RUN export API_KEY=sk_live_abc123 && npm run build
ENV DATABASE_URL=postgresql://root:password@localhost/mydb

# 🟢 Use ARG for build-time only (not stored in final image)
ARG BUILD_ARG
RUN echo "Build only: $BUILD_ARG"

# 🟢 Inject secrets at runtime via environment
docker run -e DATABASE_URL=$DATABASE_URL myapp
# Or use Docker secrets in Swarm/Kubernetes
```

### 3. .dockerignore

Check `.dockerignore` exists and excludes:

```
.env
.env.*
.git
node_modules
*.log
*.md
.DS_Store
coverage/
.nyc_output/
*.test.*
```

### 4. Pin Image Tags

```dockerfile
# 🔴 :latest is unpredictable — could change anytime
FROM node:latest
FROM python:latest

# 🟢 Pin to specific digest or version
FROM node:20.11-alpine3.19
FROM python:3.12-slim
```

### 5. Use Minimal Base Images

```dockerfile
# 🔴 Full OS image = large attack surface
FROM ubuntu:latest
FROM node:20

# 🟢 Minimal images
FROM node:20-alpine     # much smaller, fewer packages
FROM node:20-slim       # compromise between size and compatibility
# Or use distroless (no shell = no shell injection)
FROM gcr.io/distroless/nodejs20
```

### 6. Multi-Stage Builds

```dockerfile
# 🟢 Build stage has tools, final image does not
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
USER node
CMD ["node", "server.js"]
```

### 7. Read-Only Filesystem

```yaml
# docker-compose.yml
services:
  app:
    read_only: true
    tmpfs:
      - /tmp # only /tmp is writable
      - /var/run
```

### 8. Drop Capabilities

```yaml
# docker-compose.yml
services:
  app:
    cap_drop:
      - ALL # drop all capabilities
    cap_add:
      - NET_BIND_SERVICE # only add what's needed
    security_opt:
      - no-new-privileges:true # prevent privilege escalation
```

---

## docker-compose.yml Checks

### 9. No Privileged Mode

```yaml
# 🔴 CRITICAL — Full host access
services:
  app:
    privileged: true
# 🟢 Never use privileged unless absolutely necessary
```

### 10. No Host Network

```yaml
# 🔴 Container shares host network stack
network_mode: host

# 🟢 Use bridge network (default) or custom network
networks:
  - app-network
```

### 11. Limit Resources

```yaml
# Prevent DoS via resource exhaustion
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 128M
```

### 12. Health Checks

```yaml
services:
  app:
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### 13. Database Ports Not Exposed

```yaml
# 🔴 Database accessible from host
services:
  db:
    ports:
      - "5432:5432"  # publicly accessible!

# 🟢 No port mapping for DB (only accessible within Docker network)
services:
  db:
    # No ports section — only accessible by other containers
  app:
    depends_on:
      - db
    environment:
      DATABASE_URL: postgresql://user:pass@db:5432/mydb
```

---

## Image Security

### 14. Scan Images for Vulnerabilities

Advise user to run:

```bash
# Using Docker Scout (built-in)
docker scout cves myimage:latest

# Using Trivy (free)
trivy image myimage:latest

# Using Snyk
snyk container test myimage:latest
```

### 15. Image Signature Verification

For production, images should be signed:

```bash
# Docker Content Trust
export DOCKER_CONTENT_TRUST=1
```
