/**
 * Build the connect-src directive for the Content-Security-Policy header.
 *
 * Reads configured RPC URLs from environment variables so wallet connectors
 * (wagmi/viem) can reach their RPC endpoints.  The core API URL is included
 * so admin mutations are not blocked.
 */
function buildConnectSrc() {
  const origins = ["'self'"]

  const apiUrl = process.env.NEXT_PUBLIC_CORE_API_URL
  if (apiUrl) {
    try {
      const u = new URL(apiUrl)
      origins.push(`${u.protocol}//${u.host}`)
    } catch {
      // Ignore invalid URLs
    }
  }

  // Collect any configured RPC URLs from NEXT_PUBLIC_WALLET_RPC_* variables
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('NEXT_PUBLIC_WALLET_RPC_') && value) {
      try {
        const u = new URL(value)
        origins.push(`${u.protocol}//${u.host}`)
      } catch {
        // Ignore invalid RPC URLs
      }
    }
  }

  return origins.join(' ')
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
        // Apply to all routes
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `connect-src ${buildConnectSrc()}`,
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "font-src 'self'",
              "frame-src 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig
