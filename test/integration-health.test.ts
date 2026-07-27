import './setup-env'
import './setup-alias'
import { describe, it, beforeEach, after } from 'node:test'
import * as assert from 'node:assert/strict'
import { GET as healthGet } from '../app/api/integration/health/route'

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

describe('GET /api/integration/health structured logging', () => {
  it('logs exactly one structured line with no address field, and echoes requestId in the body', async (t) => {
    const logSpy = t.mock.method(console, 'log', () => {})

    const res = await healthGet()
    const body: any = await res.json()

    assert.ok(res.status === 200 || res.status === 503)
    assert.equal(typeof body.requestId, 'string')

    assert.equal(logSpy.mock.callCount(), 1)
    const parsed = JSON.parse(logSpy.mock.calls[0].arguments[0] as string)
    assert.equal(parsed.correlationId, body.requestId)
    assert.equal(parsed.method, 'GET')
    assert.equal(parsed.path, '/api/integration/health')
    assert.equal(parsed.status, res.status)
    assert.equal(parsed.rateLimit, 'not_applicable')
    // health never receives a wallet address — the field must be entirely
    // absent from the log line, not merely empty.
    assert.equal('address' in parsed, false)
    assert.equal('errorMessage' in parsed, false)
  })

  it('produces a different correlationId on each call', async (t) => {
    t.mock.method(console, 'log', () => {})

    const body1: any = await (await healthGet()).json()
    const body2: any = await (await healthGet()).json()

    assert.notEqual(body1.requestId, body2.requestId)
  })
})
