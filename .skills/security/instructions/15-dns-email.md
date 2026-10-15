# DNS, Email & Infrastructure — Instruction 15

## Coverage

SPF, DKIM, DMARC, CAA, DNSSEC, Subdomain Takeover
Email security, DNS configuration

---

## Email Security (DNS Records)

### 1. SPF Record

```
// Check: dig TXT yourdomain.com | grep spf
// 🔴 Missing SPF → anyone can send email as your domain
// 🟢 SPF record example:
"v=spf1 include:_spf.google.com include:sendgrid.net -all"
//                                                    ^^^
//                          -all = hard fail (reject others)
//                          ~all = soft fail (mark as spam)
//                          ?all = neutral (don't use)
//                          +all = pass all (NEVER USE)
```

### 2. DKIM Record

```
// Check: dig TXT default._domainkey.yourdomain.com
// 🔴 Missing DKIM → emails can be forged/modified in transit
// 🟢 DKIM is set up by your email provider (Google Workspace, SendGrid, etc.)
// Verify in provider dashboard that DKIM signing is enabled
```

### 3. DMARC Record

```
// Check: dig TXT _dmarc.yourdomain.com
// 🔴 Missing DMARC → SPF/DKIM failures are silently ignored
// 🟢 DMARC record:
"v=DMARC1; p=reject; rua=mailto:dmarc@yourdomain.com; pct=100"
//                   ^^^
//    p=none    → monitor only (start here)
//    p=quarantine → send to spam
//    p=reject  → reject completely (goal)
```

### 4. CAA Record

```
// Check: dig CAA yourdomain.com
// Prevents unauthorized CAs from issuing certificates for your domain
// 🔴 Missing → any CA can issue cert for your domain
// 🟢 CAA record:
"0 issue \"letsencrypt.org\""
"0 issue \"amazonaws.com\""
"0 issuewild \";\""  // disallow wildcard certs from any CA
```

---

## Subdomain Takeover

### 5. Check Dangling DNS Records

```bash
# For each subdomain pointing to a cloud service:
# Check if the resource still exists

# Vercel
nslookup staging.yourdomain.com
# If CNAME points to cname.vercel-dns.com but no Vercel project → takeover possible

# GitHub Pages
# If CNAME points to org.github.io but no GitHub Pages configured → takeover possible

# Heroku
nslookup app.yourdomain.com
# If CNAME points to random.herokudns.com but app deleted → takeover possible

# Common vulnerable services:
# GitHub Pages, Heroku, Netlify, Vercel, AWS S3, Azure, Shopify
```

Run for each subdomain found in DNS:

```
dig CNAME [subdomain] → get CNAME target → verify target still exists
```

### 6. Wildcard DNS Security

```
// 🔴 Wildcard DNS: *.yourdomain.com → 1.2.3.4
// → New subdomains automatically resolve, but may not have valid cert
// → Attackers can find unclaimed subdomains
// 🟢 Avoid wildcard DNS unless necessary
// 🟢 Monitor DNS changes with alerts
```

---

## DNSSEC

### 7. DNSSEC Status

```
// Check: dig DS yourdomain.com
// DNSSEC protects against DNS cache poisoning / BGP hijacking
// 🟢 Enable DNSSEC at your registrar
// Note: requires support from DNS provider
```

---

## TLS Certificate Security

### 8. Certificate Expiry Monitoring

```
// Check expiry:
openssl s_client -connect yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates

// 🔴 Expired certificate = site inaccessible = reputation damage
// 🟢 Use Let's Encrypt auto-renewal OR set calendar reminders
// 🟢 Monitor with: UptimeRobot, Checkly, or similar
```

### 9. Certificate Transparency (CT) Monitoring

```
// Monitor cert.sh for unexpected certificates issued for your domain
// https://crt.sh/?q=yourdomain.com
// 🔴 Unexpected cert → someone may have taken over a subdomain or compromised a CA
// 🟢 Set up alerts: Facebook CT Monitor, sslmate.com/certspotter
```

---

## Internal Infrastructure

### 10. Default Admin Interfaces

Scan for exposed default admin ports/paths:

```
:8080/admin     → Various frameworks
:9200           → Elasticsearch (no auth by default!)
:5601           → Kibana
:3000           → Grafana (admin:admin default)
:8500           → Consul
:4848           → GlassFish
:8888           → Jupyter Notebook (no auth by default)
:27017          → MongoDB (check if auth required)
:6379           → Redis (check if requirepass set)
```

### 11. robots.txt Information Disclosure

```
// 🔴 robots.txt reveals sensitive path structure to attackers
Disallow: /admin
Disallow: /api/internal
Disallow: /config
Disallow: /backup
// These paths become a target list!

// 🟢 Don't list sensitive paths in robots.txt
// Use auth protection, not obscurity
// Only list paths search engines should not index (for SEO reasons)
Disallow: /api/          // generic, not revealing
Disallow: /auth/         // generic
```
