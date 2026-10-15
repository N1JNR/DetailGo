// Security Skill — Express.js with Helmet security template
// npm install helmet

import helmet from 'helmet'
import crypto from 'crypto'

export function setupSecurity(app) {
  // Generate nonce per request for CSP
  app.use((req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString('base64')
    next()
  })

  app.use(helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
        styleSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    // HSTS
    hsts: {
      maxAge: 63072000,
      includeSubDomains: true,
      preload: true,
    },
    // Cross-Origin policies
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: true,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    // Referrer
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // DNS prefetch
    dnsPrefetchControl: { allow: true },
    // Remove X-Powered-By
    hidePoweredBy: true,
  }))

  // Permissions Policy (not in helmet by default)
  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
    next()
  })
}
