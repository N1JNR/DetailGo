// Security Skill — Cloudflare Workers Security Headers Template
// Deploy as a Cloudflare Worker to add security headers to any origin

export default {
  async fetch(request, env, ctx) {
    // Fetch the original response from origin
    const response = await fetch(request)

    // Clone response to allow header modification
    const newResponse = new Response(response.body, response)

    // === SECURITY HEADERS ===
    const headers = newResponse.headers

    // HSTS — force HTTPS
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')

    // Clickjacking protection
    headers.set('X-Frame-Options', 'DENY')

    // MIME sniffing protection
    headers.set('X-Content-Type-Options', 'nosniff')

    // Referrer privacy
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

    // Disable unnecessary browser features
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')

    // Cross-origin isolation (Spectre mitigation)
    headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
    headers.set('Cross-Origin-Resource-Policy', 'same-origin')

    // Content Security Policy (adjust for your app)
    headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
    )

    // Remove server fingerprinting
    headers.delete('Server')
    headers.delete('X-Powered-By')
    headers.delete('X-AspNet-Version')

    // === CACHE CONTROL ===
    const url = new URL(request.url)

    // No cache for authenticated/dynamic content
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
      headers.set('Cache-Control', 'no-store, no-cache, private')
    }

    // Long cache for static assets (with hash in filename)
    if (url.pathname.match(/\.(js|css|png|jpg|webp|woff2|ico)(\?.*)?$/)) {
      if (url.pathname.includes('/_next/static/') || url.pathname.includes('/static/')) {
        headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      }
    }

    return newResponse
  },
}
