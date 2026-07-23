/**
 * Build the connect-src directive for the Content-Security-Policy header.
 *
 * Reads configured RPC URLs from environment variables so wallet connectors
 * (wagmi/viem) can reach their RPC endpoints.  The core API URL is included
 * so admin mutations are not blocked.
 */
/**
 * Build the connect-src directive for the Content-Security-Policy header.
 *
 * Reads configured RPC URLs from environment variables so wallet connectors
 * (wagmi/viem) can reach their RPC endpoints. The core API URL is included
 * so admin mutations are not blocked.
 */
function buildConnectSrc() {
  const origins = new Set(["'self'"])

  const addUrl = (urlStr) => {
    try {
      const u = new URL(urlStr)
      origins.add(`${u.protocol}//${u.host}`)
      if (u.protocol === 'https:') {
        origins.add(`wss://${u.host}`)
      } else if (u.protocol === 'http:') {
        origins.add(`ws://${u.host}`)
      }
    } catch {
      // Ignore invalid URLs
    }
  }

  const apiUrl = process.env.NEXT_PUBLIC_CORE_API_URL
  if (apiUrl) {
    addUrl(apiUrl)
  }

  // Collect any configured RPC URLs from NEXT_PUBLIC_WALLET_RPC_* variables
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('NEXT_PUBLIC_WALLET_RPC_') && value) {
      addUrl(value)
    }
  }

  return Array.from(origins).join(' ')
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true
  },
  webpack: (config) => {
    config.externals.push('@guildpass/integration-client')
    return config
  },
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `connect-src ${buildConnectSrc()}`,
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "frame-src 'none'",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-XSS-Protection',
            value: '0',
          },
        ],
      },
    ]
  },
}

export default nextConfig

