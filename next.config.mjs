/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true
  },
  webpack: (config) => {
    config.externals.push('@guildpass/integration-client')
    return config
  }
}

export default nextConfig
