import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'

describe('Integration gateway health checks (#84)', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('isGatewayConfigured returns true when INTEGRATION_API_KEY is set', async () => {
    process.env.INTEGRATION_API_KEY='***'
    const { isGatewayConfigured } = await import('@/lib/integration-client')
    expect(isGatewayConfigured()).toBe(true)

  it('isGatewayConfigured returns false when INTEGRATION_API_KEY is missing', async () => {
    delete process.env.INTEGRATION_API_KEY
    const { isGatewayConfigured } = await import('@/lib/integration-client')
    expect(isGatewayConfigured()).toBe(false)
  })

  it('isGatewayConfigured returns false when INTEGRATION_API_KEY is empty', async () => {
    process.env.INTEGRATION_API_KEY = ''
    const { isGatewayConfigured } = await import('@/lib/integration-client')
    expect(isGatewayConfigured()).toBe(false)
  })

  it('isGatewayConfigured returns false when INTEGRATION_API_KEY is whitespace', async () => {
    process.env.INTEGRATION_API_KEY = '***'
    const { isGatewayConfigured } = await import('@/lib/integration-client')
    expect(isGatewayConfigured()).toBe(false)
  })

  it('does not expose the API key value in return', async () => {
    process.env.INTEGRATION_API_KEY='super-secret-live-key-12345'
    const { isGatewayConfigured } = await import('@/lib/integration-client')
    const result = isGatewayConfigured()
    expect(result).toBe(true)
    expect(typeof result).toBe('boolean')
    expect(JSON.stringify(result)).not.toContain('super-secret-live-key-12345')
  })

  it('isGatewayDependencyAvailable returns false when package is not installed', async () => {
    const { isGatewayDependencyAvailable } = await import('@/lib/integration-client')
    // @guildpass/integration-client is not installed in this repo
    expect(isGatewayDependencyAvailable()).toBe(false)
  })
})
