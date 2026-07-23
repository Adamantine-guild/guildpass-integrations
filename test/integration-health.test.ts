import { describe, it, beforeEach, after } from 'node:test'
import * as assert from 'node:assert/strict'

// Loaded via require so each test can bust the module cache (the node:test
// equivalent of vitest's vi.resetModules()).
function loadIntegrationClient(): typeof import('../lib/integration-client') {
  delete require.cache[require.resolve('../lib/integration-client')]
  return require('../lib/integration-client')
}

describe('Integration gateway health checks (#84)', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  after(() => {
    process.env = originalEnv
  })

  it('isGatewayConfigured returns true when INTEGRATION_API_KEY is set', () => {
    process.env.INTEGRATION_API_KEY = 'test-key'
    const { isGatewayConfigured } = loadIntegrationClient()
    assert.equal(isGatewayConfigured(), true)
  })

  it('isGatewayConfigured returns false when INTEGRATION_API_KEY is missing', () => {
    delete process.env.INTEGRATION_API_KEY
    const { isGatewayConfigured } = loadIntegrationClient()
    assert.equal(isGatewayConfigured(), false)
  })

  it('isGatewayConfigured returns false when INTEGRATION_API_KEY is empty', () => {
    process.env.INTEGRATION_API_KEY = ''
    const { isGatewayConfigured } = loadIntegrationClient()
    assert.equal(isGatewayConfigured(), false)
  })

  it('isGatewayConfigured returns false when INTEGRATION_API_KEY is whitespace', () => {
    process.env.INTEGRATION_API_KEY = '   '
    const { isGatewayConfigured } = loadIntegrationClient()
    assert.equal(isGatewayConfigured(), false)
  })

  it('does not expose the API key value in return', () => {
    process.env.INTEGRATION_API_KEY = 'super-secret-live-key-12345'
    const { isGatewayConfigured } = loadIntegrationClient()
    const result = isGatewayConfigured()
    assert.equal(result, true)
    assert.equal(typeof result, 'boolean')
    assert.equal(JSON.stringify(result).includes('super-secret-live-key-12345'), false)
  })

  it('isGatewayDependencyAvailable returns false when package is not installed', () => {
    const { isGatewayDependencyAvailable } = loadIntegrationClient()
    // @guildpass/integration-client is not installed in this repo
    assert.equal(isGatewayDependencyAvailable(), false)
  })
})
