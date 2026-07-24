/** Direct CSRF origin and Referer coverage for issue #296. */
import './setup-env'

import { after, beforeEach, describe, it } from 'node:test'
import * as assert from 'node:assert/strict'

function loadCsrf(): typeof import('../lib/csrf') {
  delete require.cache[require.resolve('../lib/config')]
  delete require.cache[require.resolve('../lib/csrf')]
  return require('../lib/csrf')
}

function mockNextRequest(
  method: string,
  headers: Record<string, string> = {},
  url = 'https://admin.guildpass.test/api/integration/membership',
) {
  return {
    method,
    url,
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? null
      },
    },
  }
}

describe('integration gateway CSRF validation', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_MOCK_MODE: 'true',
      NEXT_PUBLIC_SIWE_DOMAIN: 'admin.guildpass.test',
    }
    delete process.env.INTEGRATION_ALLOWED_ORIGIN
  })

  after(() => {
    process.env = originalEnv
  })

  it('normalizes a configured integration gateway origin', () => {
    process.env.INTEGRATION_ALLOWED_ORIGIN = 'https://gateway.guildpass.test/path'
    const { expectedIntegrationGatewayOrigin } = loadCsrf()

    assert.equal(
      expectedIntegrationGatewayOrigin('https://admin.guildpass.test/api/integration'),
      'https://gateway.guildpass.test',
    )
  })

  it('uses a fully qualified SIWE domain as the expected origin', () => {
    process.env.NEXT_PUBLIC_SIWE_DOMAIN = 'http://admin.guildpass.test/path'
    const { expectedIntegrationGatewayOrigin } = loadCsrf()

    assert.equal(
      expectedIntegrationGatewayOrigin('https://request.guildpass.test/api/integration'),
      'http://admin.guildpass.test',
    )
  })

  it('derives the expected origin protocol from the request URL', () => {
    const { expectedIntegrationGatewayOrigin } = loadCsrf()

    assert.equal(
      expectedIntegrationGatewayOrigin('http://admin.guildpass.test/api/integration'),
      'http://admin.guildpass.test',
    )
  })

  it('defaults to HTTPS when the request URL is unparseable', () => {
    const { expectedIntegrationGatewayOrigin } = loadCsrf()

    assert.equal(
      expectedIntegrationGatewayOrigin('not a valid URL'),
      'https://admin.guildpass.test',
    )
  })

  it('returns null for a malformed configured origin', () => {
    process.env.INTEGRATION_ALLOWED_ORIGIN = 'not a valid URL'
    const { expectedIntegrationGatewayOrigin } = loadCsrf()

    assert.equal(
      expectedIntegrationGatewayOrigin('https://admin.guildpass.test/api/integration'),
      null,
    )
  })

  it('allows GET, HEAD, and OPTIONS regardless of headers', () => {
    const { validateIntegrationGatewayCsrf } = loadCsrf()

    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const req = mockNextRequest(method, {
        origin: 'https://evil.example',
        referer: 'not a valid URL',
      })

      assert.equal(validateIntegrationGatewayCsrf(req as any), null)
    }
  })

  it('allows POST, PUT, and DELETE with a matching Origin', () => {
    const { validateIntegrationGatewayCsrf } = loadCsrf()

    for (const method of ['POST', 'PUT', 'DELETE']) {
      const req = mockNextRequest(method, { origin: 'https://admin.guildpass.test' })

      assert.equal(validateIntegrationGatewayCsrf(req as any), null)
    }
  })

  it('rejects POST, PUT, and DELETE with a mismatched Origin', () => {
    const { validateIntegrationGatewayCsrf } = loadCsrf()

    for (const method of ['POST', 'PUT', 'DELETE']) {
      const req = mockNextRequest(method, { origin: 'https://evil.example' })
      const res = validateIntegrationGatewayCsrf(req as any)

      assert.ok(res)
      assert.equal(res.status, 403)
    }
  })

  it('allows POST with a matching Referer when Origin is absent', () => {
    const { validateIntegrationGatewayCsrf } = loadCsrf()
    const req = mockNextRequest('POST', {
      referer: 'https://admin.guildpass.test/admin/settings',
    })

    assert.equal(validateIntegrationGatewayCsrf(req as any), null)
  })

  it('rejects POST with a mismatched Referer when Origin is absent', () => {
    const { validateIntegrationGatewayCsrf } = loadCsrf()
    const req = mockNextRequest('POST', { referer: 'https://evil.example/attack' })
    const res = validateIntegrationGatewayCsrf(req as any)

    assert.ok(res)
    assert.equal(res.status, 403)
  })

  it('rejects POST when both Origin and Referer are absent', async () => {
    const { validateIntegrationGatewayCsrf } = loadCsrf()
    const res = validateIntegrationGatewayCsrf(mockNextRequest('POST') as any)

    assert.ok(res)
    assert.equal(res.status, 403)
    assert.deepEqual(await res.json(), {
      error: 'Origin or Referer header is required for integration gateway mutations.',
    })
  })

  it('returns 503 when the expected origin cannot be resolved', async () => {
    process.env.NEXT_PUBLIC_SIWE_DOMAIN = ''
    const { expectedIntegrationGatewayOrigin, validateIntegrationGatewayCsrf } = loadCsrf()
    const req = mockNextRequest('POST', { origin: 'https://admin.guildpass.test' })

    assert.equal(expectedIntegrationGatewayOrigin(req.url), null)

    const res = validateIntegrationGatewayCsrf(req as any)
    assert.ok(res)
    assert.equal(res.status, 503)
    assert.deepEqual(await res.json(), {
      error: 'Integration gateway CSRF protection is misconfigured.',
    })
  })
})
