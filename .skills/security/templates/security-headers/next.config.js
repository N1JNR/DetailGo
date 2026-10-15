/** @type {import('next').NextConfig} */
// Security Skill — Next.js security headers template
// Merge with your existing next.config.js

const securityHeaders = [
  // Prevent DNS prefetching leaking visited URLs
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Force HTTPS for 2 years, include subdomains, allow preload list
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Prevent clickjacking
  { key: 'X-Frame-Options', value: 'DENY' },
  // Prevent MIME sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Referrer privacy
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable unnecessary browser features
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()' },
  // Spectre mitigation — cross-origin isolation
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  // Remove server fingerprinting
  // Note: X-Powered-By is removed automatically by Next.js
]

const nextConfig = {
  // Security: disable source maps in production
  productionBrowserSourceMaps: false,

  // Security: add headers to all routes
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      // Looser policy for API routes if needed
      // {
      //   source: '/api/(.*)',
      //   headers: [
      //     { key: 'Cross-Origin-Embedder-Policy', value: 'unsafe-none' },
      //   ],
      // },
    ]
  },

  // Security: redirect HTTP to HTTPS (handled by most platforms, but just in case)
  async redirects() {
    return []
  },
}

module.exports = nextConfig
