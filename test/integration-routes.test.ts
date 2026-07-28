import './setup-env'
import './setup-alias'
import { describe, it, beforeEach, after } from 'node:test'
import * as assert from 'node:assert/strict'
import type { NextRequest } from 'next/server'
import * as integrationClient from '../lib/integration-client'
import {
  GatewayConfigurationError,
  GatewayDependencyError,
  GatewayMethodError,
} from '../lib/integration-client'
import { GET as membershipGet } from '../app/api/integration/membership/route'
import { GET as verifyGet } from '../app/api/integration/verify/route'
import { resetIntegrationResilienceState } from '../lib/integration/resilientCall'

// Routes now call the gateway through resilientCall(), which retries transient
// (non-Gateway*Error) failures and trips a circuit breaker per `key` after
// repeated failures. Disable retries so error-path tests fail on the first
// attempt (matches callCount assertions) and reset the breaker before every
// test so one test's failures can't open the circuit for the next.
process.env.INTEGRATION_RETRY_MAX_ATTEMPTS = '0'

beforeEach(() => {
  resetIntegrationResilienceState()
})

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

let ipSeq = 0
function freshIp(): string {
  ipSeq += 1
  return `test-ip-${ipSeq}`
}

let addrSeq = 0
/** A syntactically valid 0x + 40 hex address, unique per call so the
 * per-wallet rate-limit bucket never leaks state between tests. */
function freshAddress(): string {
  addrSeq += 1
  return '0x' + addrSeq.toString(16).padStart(40, '0')
}

function mockNextRequest(opts: {
  pathname: string
  address?: string | null
  ip?: string
}): NextRequest {
  const address = opts.address ?? null
  const ip = opts.ip ?? freshIp()
  return {
    method: 'GET',
    url: `https://admin.guildpass.test${opts.pathname}`,
    nextUrl: {
      pathname: opts.pathname,
      searchParams: {
        get(key: string) {
          return key === 'address' ? address : null
        },
      },
    },
    headers: {
      get(name: string) {
        return name.toLowerCase() === 'x-forwarded-for' ? ip : null
      },
    },
  } as unknown as NextRequest
}

/** Reads the most recent console.log call recorded by a t.mock.method(console, 'log') spy. */
function lastLoggedLine(logSpy: { mock: { calls: { arguments: unknown[] }[] } }) {
  const calls = logSpy.mock.calls
  assert.ok(calls.length > 0, 'expected at least one console.log call')
  const raw = calls[calls.length - 1].arguments[0] as string
  return { raw, parsed: JSON.parse(raw) }
}

// ===========================================================================
// Shared suite for the two address-bearing gateway routes (membership, verify)
// ===========================================================================

function registerGatewayRouteTests(config: {
  pathname: string
  handler: (req: NextRequest) => Promise<Response>
  moduleKey: 'fetchMembershipByWallet' | 'verifyWallet'
  fallbackErrorMessage: string
  makeSuccessBody: (address: string) => Record<string, unknown>
}) {
  const { pathname, handler, moduleKey, fallbackErrorMessage, makeSuccessBody } = config

  describe(`GET ${pathname}`, () => {
    it('returns 400 + requestId when address query param is missing, and logs the rejection', async (t) => {
      const fetchMock = t.mock.method(integrationClient as any, moduleKey, async () => {
        throw new Error('gateway should not be called')
      })
      const logSpy = t.mock.method(console, 'log', () => {})

      const req = mockNextRequest({ pathname })
      const res = await handler(req)
      const body: any = await res.json()

      assert.equal(res.status, 400)
      assert.equal(body.error, 'Missing required query parameter: address')
      assert.equal(typeof body.requestId, 'string')
      assert.equal(fetchMock.mock.callCount(), 0)

      const { parsed } = lastLoggedLine(logSpy)
      assert.equal(parsed.correlationId, body.requestId)
      assert.equal(parsed.status, 400)
      assert.equal(parsed.rateLimit, 'allowed')
      assert.equal('address' in parsed, false)
    })

    it('returns 200 with the gateway JSON for a valid address and logs an allowed, redacted line', async (t) => {
      const address = freshAddress()
      const successBody = makeSuccessBody(address)
      const gatewayMock = t.mock.method(integrationClient as any, moduleKey, async () => successBody)
      const logSpy = t.mock.method(console, 'log', () => {})

      const req = mockNextRequest({ pathname, address })
      const res = await handler(req)
      const body = await res.json()

      assert.equal(res.status, 200)
      assert.deepEqual(body, successBody)
      assert.equal(gatewayMock.mock.callCount(), 1)
      assert.equal(gatewayMock.mock.calls[0].arguments[0], address)

      const { raw, parsed } = lastLoggedLine(logSpy)
      assert.equal(raw.includes(address), false, 'log line must never contain the full raw address')
      assert.equal(parsed.status, 200)
      assert.equal(parsed.rateLimit, 'allowed')
      assert.equal(parsed.method, 'GET')
      assert.equal(parsed.path, pathname)
      assert.equal(typeof parsed.correlationId, 'string')
      assert.equal(parsed.address, `${address.slice(0, 6)}…${address.slice(-4)}`)
      assert.equal('errorMessage' in parsed, false)
    })

    it('returns 502 + requestId with a safe message when the gateway throws, and logs only the error message', async (t) => {
      const address = freshAddress()
      t.mock.method(integrationClient as any, moduleKey, async () => {
        throw new Error('Upstream service unavailable')
      })
      const logSpy = t.mock.method(console, 'log', () => {})

      const req = mockNextRequest({ pathname, address })
      const res = await handler(req)
      const body: any = await res.json()

      assert.equal(res.status, 502)
      assert.deepEqual(body, { error: fallbackErrorMessage, requestId: body.requestId })
      assert.equal(typeof body.requestId, 'string')

      const { raw, parsed } = lastLoggedLine(logSpy)
      assert.equal(raw.includes(address), false)
      assert.equal(parsed.correlationId, body.requestId)
      assert.equal(parsed.status, 502)
      assert.equal(parsed.errorMessage, 'Upstream service unavailable')
    })

    it('returns 502 + requestId with a safe fallback for non-Error throws', async (t) => {
      const address = freshAddress()
      t.mock.method(integrationClient as any, moduleKey, async () => {
        throw 'something broke'
      })
      const logSpy = t.mock.method(console, 'log', () => {})

      const req = mockNextRequest({ pathname, address })
      const res = await handler(req)
      const body: any = await res.json()

      assert.equal(res.status, 502)
      assert.deepEqual(body, { error: fallbackErrorMessage, requestId: body.requestId })

      const { parsed } = lastLoggedLine(logSpy)
      assert.equal(parsed.errorMessage, 'something broke')
    })

    it('returns 400 for malformed/oversized addresses, never calls the gateway, and never leaks the raw value in the log', async (t) => {
      const gatewayMock = t.mock.method(integrationClient as any, moduleKey, async () => {
        throw new Error('gateway should not be called')
      })

      for (const bad of [
        '0xabc',
        'not-an-address',
        '0x' + 'g'.repeat(40),
        '0x' + '1'.repeat(41),
        "0x1234567890abcdef1234567890abcdef12345678'; DROP TABLE members;--",
        '0x' + '1'.repeat(2_000_000), // oversized: format check doubles as a size bound
      ]) {
        const logSpy = t.mock.method(console, 'log', () => {})

        const req = mockNextRequest({ pathname, address: bad })
        const res = await handler(req)
        const body: any = await res.json()

        assert.equal(res.status, 400, `expected 400 for ${bad.slice(0, 20)}...`)
        assert.deepEqual(body, { error: 'Invalid address format.', requestId: body.requestId })

        const { raw, parsed } = lastLoggedLine(logSpy)
        assert.equal(raw.includes(bad), false, 'log line must not contain the raw malformed address')
        assert.equal(parsed.address, '[redacted-address]')
        assert.equal(parsed.correlationId, body.requestId)

        logSpy.mock.restore()
      }

      assert.equal(gatewayMock.mock.callCount(), 0)
    })

    it('returns 503 + requestId when the gateway is misconfigured (missing API key)', async (t) => {
      const address = freshAddress()
      t.mock.method(integrationClient as any, moduleKey, async () => {
        throw new GatewayConfigurationError('INTEGRATION_API_KEY is required.')
      })
      const logSpy = t.mock.method(console, 'log', () => {})

      const req = mockNextRequest({ pathname, address })
      const res = await handler(req)
      const body: any = await res.json()

      assert.equal(res.status, 503)
      assert.deepEqual(body, { error: 'Integration gateway misconfigured.', requestId: body.requestId })

      const { parsed } = lastLoggedLine(logSpy)
      assert.equal(parsed.status, 503)
      assert.equal(parsed.correlationId, body.requestId)
    })

    it('returns 503 + requestId when the optional client dependency is missing', async (t) => {
      const address = freshAddress()
      t.mock.method(integrationClient as any, moduleKey, async () => {
        throw new GatewayDependencyError('Optional dependency not installed.')
      })
      const logSpy = t.mock.method(console, 'log', () => {})

      const req = mockNextRequest({ pathname, address })
      const res = await handler(req)
      const body: any = await res.json()

      assert.equal(res.status, 503)
      assert.deepEqual(body, {
        error: 'Integration gateway unavailable: missing optional dependency.',
        requestId: body.requestId,
      })

      const { parsed } = lastLoggedLine(logSpy)
      assert.equal(parsed.correlationId, body.requestId)
    })

    it('returns 503 + requestId when the client does not expose the expected method', async (t) => {
      const address = freshAddress()
      t.mock.method(integrationClient as any, moduleKey, async () => {
        throw new GatewayMethodError('Method not found.')
      })
      const logSpy = t.mock.method(console, 'log', () => {})

      const req = mockNextRequest({ pathname, address })
      const res = await handler(req)
      const body: any = await res.json()

      assert.equal(res.status, 503)
      assert.deepEqual(body, {
        error: 'Integration gateway unavailable: unsupported client method.',
        requestId: body.requestId,
      })

      const { parsed } = lastLoggedLine(logSpy)
      assert.equal(parsed.correlationId, body.requestId)
    })

    it('a request rejected by the rate limiter still emits a structured log line with rateLimit=limited', async (t) => {
      const ip = freshIp()
      t.mock.method(integrationClient as any, moduleKey, async () => makeSuccessBody(freshAddress()))
      const logSpy = t.mock.method(console, 'log', () => {})

      // Exhaust the 30-request/minute per-IP bucket.
      for (let i = 0; i < 30; i++) {
        await handler(mockNextRequest({ pathname, address: freshAddress(), ip }))
      }
      logSpy.mock.resetCalls()

      const req = mockNextRequest({ pathname, address: freshAddress(), ip })
      const res = await handler(req)
      const body: any = await res.json()

      assert.equal(res.status, 429)
      assert.equal(body.error, 'Too many requests')
      assert.equal(typeof body.requestId, 'string')
      assert.equal(typeof body.retryAfter, 'number')

      const { parsed } = lastLoggedLine(logSpy)
      assert.equal(parsed.correlationId, body.requestId)
      assert.equal(parsed.status, 429)
      assert.equal(parsed.rateLimit, 'limited')
    })
  })
}

registerGatewayRouteTests({
  pathname: '/api/integration/membership',
  handler: membershipGet,
  moduleKey: 'fetchMembershipByWallet',
  fallbackErrorMessage: 'Unable to fetch membership information due to an internal error.',
  makeSuccessBody: (address) => ({
    address,
    tier: 'gold',
    active: true,
    expiresAt: '2027-06-01T00:00:00.000Z',
  }),
})

registerGatewayRouteTests({
  pathname: '/api/integration/verify',
  handler: verifyGet,
  moduleKey: 'verifyWallet',
  fallbackErrorMessage: 'Unable to verify wallet due to an internal error.',
  makeSuccessBody: () => ({
    verified: true,
    method: 'signature',
    checkedAt: '2026-06-29T03:00:00.000Z',
  }),
})

// ===========================================================================
// Tests: CSRF protection for /api/integration/* mutation handlers
// ===========================================================================

function loadCsrf(): typeof import('../lib/csrf') {
  delete require.cache[require.resolve('../lib/config')]
  delete require.cache[require.resolve('../lib/csrf')]
  return require('../lib/csrf')
}

function mockCsrfRequest(
  method: string,
  headers: Record<string, string>,
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

describe('integration gateway CSRF protection', () => {
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

  it('rejects mutation requests without Origin or Referer with 403', async () => {
    const { validateIntegrationGatewayCsrf } = loadCsrf()
    const req = mockCsrfRequest('POST', {})

    const res = validateIntegrationGatewayCsrf(req as any)

    assert.ok(res)
    assert.equal(res.status, 403)
    assert.deepEqual(await res.json(), {
      error: 'Origin or Referer header is required for integration gateway mutations.',
    })
  })

  it('rejects a mismatched Origin with 403', async () => {
    const { validateIntegrationGatewayCsrf } = loadCsrf()
    const req = mockCsrfRequest('POST', { origin: 'https://evil.example' })

    const res = validateIntegrationGatewayCsrf(req as any)

    assert.ok(res)
    assert.equal(res.status, 403)
    assert.deepEqual(await res.json(), {
      error: 'Cross-origin requests are not allowed for integration gateway mutations.',
    })
  })

  it('allows a matching Origin', () => {
    const { validateIntegrationGatewayCsrf } = loadCsrf()
    const req = mockCsrfRequest('PUT', { origin: 'https://admin.guildpass.test' })

    const res = validateIntegrationGatewayCsrf(req as any)

    assert.equal(res, null)
  })

  it('allows a matching Referer when Origin is absent', () => {
    const { validateIntegrationGatewayCsrf } = loadCsrf()
    const req = mockCsrfRequest('POST', {
      referer: 'https://admin.guildpass.test/admin/settings',
    })

    const res = validateIntegrationGatewayCsrf(req as any)

    assert.equal(res, null)
  })

  it('rejects a mismatched Referer when Origin is absent', async () => {
    const { validateIntegrationGatewayCsrf } = loadCsrf()
    const req = mockCsrfRequest('POST', { referer: 'https://evil.example/attack' })

    const res = validateIntegrationGatewayCsrf(req as any)

    assert.ok(res)
    assert.equal(res.status, 403)
    assert.deepEqual(await res.json(), {
      error: 'Cross-origin requests are not allowed for integration gateway mutations.',
    })
  })

  it('rejects an unparseable Referer when Origin is absent', async () => {
    const { validateIntegrationGatewayCsrf } = loadCsrf()
    const req = mockCsrfRequest('POST', { referer: 'not a valid URL' })

    const res = validateIntegrationGatewayCsrf(req as any)

    assert.ok(res)
    assert.equal(res.status, 403)
    assert.deepEqual(await res.json(), {
      error: 'Cross-origin requests are not allowed for integration gateway mutations.',
    })
  })

  it('uses the configurable allowed origin when provided', () => {
    process.env.INTEGRATION_ALLOWED_ORIGIN = 'https://gateway.guildpass.test'
    const { validateIntegrationGatewayCsrf } = loadCsrf()
    const req = mockCsrfRequest('POST', { origin: 'https://gateway.guildpass.test' })

    const res = validateIntegrationGatewayCsrf(req as any)

    assert.equal(res, null)
  })

  it('allows safe methods without Origin or Referer', () => {
    const { validateIntegrationGatewayCsrf } = loadCsrf()

    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const req = mockCsrfRequest(method, {})
      const res = validateIntegrationGatewayCsrf(req as any)

      assert.equal(res, null, `${method} should bypass CSRF validation`)
    }
  })
})
