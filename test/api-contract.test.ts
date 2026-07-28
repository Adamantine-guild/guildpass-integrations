import './setup-env'
import { describe, test, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { MockAccessApi } from '../lib/api/mock'
import { LiveAccessApi } from '../lib/api/live'
import { ApiError, isApiError } from '../lib/api/errors'
import { computeAccessDecision } from '../lib/api/access-decision'
import type { AccessApi, MembershipTier, Session } from '../lib/api/types'
import * as FIXTURES from './fixtures/live-api-responses'

function normalize<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

function stubFetch(responses: Record<string, unknown>) {
  global.fetch = async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [pattern, data] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        if (data === null || data === undefined) {
          return new Response(null, { status: 204 }) as any
        }
        return new Response(JSON.stringify(data), { status: 200 }) as any
      }
    }
    return new Response('Not Found', { status: 404 }) as any
  }
}

afterEach(() => {
  delete (global as any).fetch
})

// ── Session lookup ────────────────────────────────────────────────────────────

describe('session lookup', () => {
  test('MockAccessApi returns a valid Session', async () => {
    const api = new MockAccessApi('0xabc')
    const session = await api.getSession()

    assert.equal(typeof session.address, 'string')
    assert.ok(Array.isArray(session.roles))
    assert.ok(session.community)
    assert.equal(typeof session.community!.id, 'string')
    assert.equal(typeof session.community!.name, 'string')
    assert.ok(Array.isArray(session.community!.tiers))
  })

  test('LiveAccessApi returns a valid Session', async () => {
    stubFetch({ '/v1/session': FIXTURES.session })
    const api = new LiveAccessApi('0xabc')
    const session = await api.getSession()

    assert.equal(typeof session.address, 'string')
    assert.ok(Array.isArray(session.roles))
    assert.ok(session.community)
    assert.equal(typeof session.community!.id, 'string')
    assert.equal(typeof session.community!.name, 'string')
    assert.ok(Array.isArray(session.community!.tiers))
  })

  test('both APIs produce the same Session view model', async () => {
    const mockResult = await new MockAccessApi('0xabc').getSession()

    stubFetch({ '/v1/session': FIXTURES.session })
    const liveResult = await new LiveAccessApi('0xabc').getSession()

    assert.deepStrictEqual(normalize(mockResult), normalize(liveResult))
  })
})

// ── Membership lookup ─────────────────────────────────────────────────────────

describe('membership lookup', () => {
  test('MockAccessApi returns a valid Membership', async () => {
    const api = new MockAccessApi()
    const m = await api.getMembership('0xabc')

    assert.ok(m)
    assert.equal(typeof m.address, 'string')
    assert.ok(['free', 'standard', 'pro'].includes(m.tier))
    assert.equal(typeof m.active, 'boolean')
  })

  test('LiveAccessApi returns a valid Membership', async () => {
    stubFetch({ '/api/integration/membership': FIXTURES.membership })
    const api = new LiveAccessApi()
    const m = await api.getMembership('0xabc')

    assert.ok(m)
    assert.equal(typeof m.address, 'string')
    assert.ok(['free', 'standard', 'pro'].includes(m.tier))
    assert.equal(typeof m.active, 'boolean')
  })

  test('both APIs produce the same Membership view model', async () => {
    const mockResult = await new MockAccessApi().getMembership('0xabc')

    stubFetch({ '/api/integration/membership': FIXTURES.membership })
    const liveResult = await new LiveAccessApi().getMembership('0xabc')

    assert.deepStrictEqual(normalize(mockResult), normalize(liveResult))
  })
})

// ── Profile lookup ────────────────────────────────────────────────────────────

describe('profile lookup', () => {
  test('MockAccessApi returns a valid MemberProfile', async () => {
    const api = new MockAccessApi()
    const p = await api.getProfile('0xabc')

    assert.ok(p)
    assert.equal(typeof p.address, 'string')
    assert.ok(Array.isArray(p.badges))
  })

  test('LiveAccessApi returns a valid MemberProfile', async () => {
    stubFetch({ '/v1/members/0xabc/profile': FIXTURES.profile })
    const api = new LiveAccessApi()
    const p = await api.getProfile('0xabc')

    assert.ok(p)
    assert.equal(typeof p.address, 'string')
    assert.ok(Array.isArray(p.badges))
  })

  test('both APIs produce the same MemberProfile view model', async () => {
    const mockResult = await new MockAccessApi().getProfile('0xabc')

    stubFetch({ '/v1/members/0xabc/profile': FIXTURES.profile })
    const liveResult = await new LiveAccessApi().getProfile('0xabc')

    assert.deepStrictEqual(normalize(mockResult), normalize(liveResult))
  })
})

// ── Resource listing ──────────────────────────────────────────────────────────

describe('resource listing', () => {
  test('MockAccessApi returns valid Resource[]', async () => {
    const api = new MockAccessApi()
    const resources = await api.listResources()

    assert.ok(Array.isArray(resources))
    assert.ok(resources.length > 0)
    for (const r of resources) {
      assert.equal(typeof r.id, 'string')
      assert.equal(typeof r.title, 'string')
      assert.ok(Array.isArray(r.roles))
    }
  })

  test('LiveAccessApi returns valid Resource[]', async () => {
    stubFetch({ '/v1/resources': FIXTURES.resources })
    const api = new LiveAccessApi()
    const resources = await api.listResources()

    assert.ok(Array.isArray(resources))
    assert.ok(resources.length > 0)
    for (const r of resources) {
      assert.equal(typeof r.id, 'string')
      assert.equal(typeof r.title, 'string')
      assert.ok(Array.isArray(r.roles))
    }
  })

  test('both APIs produce the same Resource[] view models', async () => {
    const mockResult = await new MockAccessApi().listResources()

    stubFetch({ '/v1/resources': FIXTURES.resources })
    const liveResult = await new LiveAccessApi().listResources()

    assert.deepStrictEqual(normalize(mockResult), normalize(liveResult))
  })
})

// ── Resource lookup ───────────────────────────────────────────────────────────

describe('resource lookup', () => {
  test('MockAccessApi returns valid Resource or null', async () => {
    const api = new MockAccessApi()
    const r = await api.getResource('alpha')
    assert.equal(r.status, 'found')
    assert.equal(r.status === 'found' && r.data.id, 'alpha')
    assert.equal(r.status === 'found' && r.data.title, 'Alpha Docs')

    const nil = await api.getResource('non-existent')
    assert.equal(nil.status, 'not_found')
  })

  test('LiveAccessApi returns valid Resource via direct lookup', async () => {
    stubFetch({ '/v1/resources/alpha': FIXTURES.resource })
    const api = new LiveAccessApi()
    const r = await api.getResource('alpha')
    assert.equal(r.status, 'found')
    assert.equal(r.status === 'found' && r.source, 'direct')
    assert.equal(r.status === 'found' && r.data.id, 'alpha')
    assert.equal(r.status === 'found' && r.data.title, 'Alpha Docs')
  })

  test('LiveAccessApi falls back to list search when direct lookup returns 404', async () => {
    // Direct lookup fails with 404, but list search succeeds
    stubFetch({
      '/v1/resources/alpha': undefined, // trigger 404 in stubFetch if not found in responses
      '/v1/resources': FIXTURES.resources,
    })
    const api = new LiveAccessApi()
    const r = await api.getResource('alpha')
    assert.equal(r.status, 'found')
    assert.equal(r.status === 'found' && r.source, 'fallback')
    assert.equal(r.status === 'found' && r.data.id, 'alpha')
  })

  test('LiveAccessApi returns not_found when both direct lookup and list search fail', async () => {
    stubFetch({
      '/v1/resources/non-existent': undefined,
      '/v1/resources': [],
    })
    const api = new LiveAccessApi()
    const r = await api.getResource('non-existent')
    assert.equal(r.status, 'not_found')
  })

  test('LiveAccessApi returns error result for server failures without using not found state', async () => {
    global.fetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/v1/resources/alpha')) {
        return new Response('Server Error', { status: 500 }) as any
      }
      return new Response(JSON.stringify(FIXTURES.resources), { status: 200 }) as any
    }

    const api = new LiveAccessApi()
    const r = await api.getResource('alpha')
    assert.equal(r.status, 'error')
    assert.equal(r.status === 'error' && r.error.code, 'server_error')
  })

  test('both APIs produce identical Resource lookup results', async () => {
    const mockResult = await new MockAccessApi().getResource('alpha')

    stubFetch({ '/v1/resources/alpha': FIXTURES.resource })
    const liveResult = await new LiveAccessApi().getResource('alpha')

    assert.deepStrictEqual(normalize(mockResult), normalize(liveResult))
  })
})

// ── Policy listing ────────────────────────────────────────────────────────────

describe('policy listing', () => {
  test('MockAccessApi returns valid AccessPolicy[]', async () => {
    const api = new MockAccessApi()
    const policies = await api.listPolicies()

    assert.ok(Array.isArray(policies))
    assert.ok(policies.length > 0)
    for (const p of policies) {
      assert.equal(typeof p.resourceId, 'string')
      assert.ok(Array.isArray(p.roles))
    }
  })

  test('LiveAccessApi returns valid AccessPolicy[]', async () => {
    stubFetch({ '/v1/policies': FIXTURES.policies })
    const api = new LiveAccessApi()
    const policies = await api.listPolicies()

    assert.ok(Array.isArray(policies))
    assert.ok(policies.length > 0)
    for (const p of policies) {
      assert.equal(typeof p.resourceId, 'string')
      assert.ok(Array.isArray(p.roles))
    }
  })

  test('both APIs produce the same AccessPolicy[] view models', async () => {
    const mockResult = await new MockAccessApi().listPolicies()

    stubFetch({ '/v1/policies': FIXTURES.policies })
    const liveResult = await new LiveAccessApi().listPolicies()

    const cleanMock = mockResult.map(({ updatedAt, ...rest }) => rest)
    const cleanLive = liveResult.map(({ updatedAt, ...rest }) => rest)

    assert.deepStrictEqual(normalize(cleanMock), normalize(cleanLive))
  })
})

// ── Policy lookup ─────────────────────────────────────────────────────────────

describe('policy lookup', () => {
  test('MockAccessApi returns valid AccessPolicy or null', async () => {
    const api = new MockAccessApi()
    const p = await api.getPolicy('alpha')
    assert.ok(p)
    assert.equal(p.resourceId, 'alpha')

    const nil = await api.getPolicy('non-existent')
    assert.equal(nil, null)
  })

  test('LiveAccessApi returns valid AccessPolicy via direct lookup', async () => {
    stubFetch({ '/v1/policies/alpha': FIXTURES.policy })
    const api = new LiveAccessApi()
    const p = await api.getPolicy('alpha')
    assert.ok(p)
    assert.equal(p.resourceId, 'alpha')
    assert.equal(p.minTier, 'standard')
  })

  test('LiveAccessApi falls back to list search when direct policy lookup returns 404', async () => {
    stubFetch({
      '/v1/policies/alpha': undefined,
      '/v1/policies': FIXTURES.policies,
    })
    const api = new LiveAccessApi()
    const p = await api.getPolicy('alpha')
    assert.ok(p)
    assert.equal(p.resourceId, 'alpha')
  })

  test('LiveAccessApi returns null when both direct policy lookup and list search fail', async () => {
    stubFetch({
      '/v1/policies/non-existent': undefined,
      '/v1/policies': [],
    })
    const api = new LiveAccessApi()
    const p = await api.getPolicy('non-existent')
    assert.equal(p, null)
  })

  test('both APIs produce identical AccessPolicy lookup results', async () => {
    const mockResult = await new MockAccessApi().getPolicy('alpha')

    stubFetch({ '/v1/policies/alpha': FIXTURES.policy })
    const liveResult = await new LiveAccessApi().getPolicy('alpha')

    const { updatedAt: _, ...cleanMock } = mockResult || {}
    const { updatedAt: __, ...cleanLive } = liveResult || {}

    assert.deepStrictEqual(normalize(cleanMock), normalize(cleanLive))
  })
})

// ── Policy updates ────────────────────────────────────────────────────────────

describe('policy updates', () => {
  test('MockAccessApi accepts a valid policy update', async () => {
    const api = new MockAccessApi()
    await assert.doesNotReject(() =>
      api.updatePolicy({ resourceId: 'alpha', minTier: 'pro' }),
    )
  })

  test('LiveAccessApi accepts a valid policy update', async () => {
    stubFetch({
      '/v1/policies/alpha': null,
    })
    const api = new LiveAccessApi()
    await assert.doesNotReject(() =>
      api.updatePolicy({ resourceId: 'alpha', minTier: 'pro' }),
    )
  })

  test('both APIs reject an invalid policy', async () => {
    const mockApi = new MockAccessApi()
    const liveApi = new LiveAccessApi()

    await assert.rejects(() => mockApi.updatePolicy({ resourceId: '' }))
    await assert.rejects(() => liveApi.updatePolicy({ resourceId: '' }))
  })
})

// ── Access decisions ──────────────────────────────────────────────────────────

describe('access decisions', () => {
  test('MockAccessApi session produces correct allowed decision', async () => {
    const api = new MockAccessApi('0xabc')
    const session = await api.getSession()
    const decision = computeAccessDecision(session, { minTier: 'free' })

    assert.equal(decision.allowed, true)
    assert.equal(typeof decision.reason, 'string')
    assert.equal(typeof decision.checkedAt, 'string')
  })

  test('LiveAccessApi session produces correct allowed decision', async () => {
    stubFetch({ '/v1/session': FIXTURES.session })
    const api = new LiveAccessApi('0xabc')
    const session = await api.getSession()
    const decision = computeAccessDecision(session, { minTier: 'free' })

    assert.equal(decision.allowed, true)
    assert.equal(typeof decision.reason, 'string')
    assert.equal(typeof decision.checkedAt, 'string')
  })

  test('both APIs produce identical access decisions for the same requirements', async () => {
    const mockSession = await new MockAccessApi('0xabc').getSession()

    stubFetch({ '/v1/session': FIXTURES.session })
    const liveSession = await new LiveAccessApi('0xabc').getSession()

    const requirements: { minTier?: MembershipTier } = { minTier: 'free' }
    const mockDecision = computeAccessDecision(mockSession, requirements)
    const liveDecision = computeAccessDecision(liveSession, requirements)

    const { checkedAt: _, ...cleanMock } = mockDecision
    const { checkedAt: __, ...cleanLive } = liveDecision
    assert.deepStrictEqual(normalize(cleanMock), normalize(cleanLive))
  })

  test('denied decision is consistent across both APIs', async () => {
    const mockSession = await new MockAccessApi('0xabc').getSession()

    stubFetch({ '/v1/session': FIXTURES.session })
    const liveSession = await new LiveAccessApi('0xabc').getSession()

    const requirements: { minTier?: MembershipTier } = { minTier: 'pro' }
    const mockDecision = computeAccessDecision(mockSession, requirements)
    const liveDecision = computeAccessDecision(liveSession, requirements)

    assert.equal(mockDecision.allowed, false)
    assert.equal(liveDecision.allowed, false)

    const { checkedAt: _, ...cleanMock } = mockDecision
    const { checkedAt: __, ...cleanLive } = liveDecision
    assert.deepStrictEqual(normalize(cleanMock), normalize(cleanLive))
  })
})

// ── Member listing ────────────────────────────────────────────────────────────

describe('member listing', () => {
  test('MockAccessApi returns valid MemberRow[]', async () => {
    const api = new MockAccessApi('0xabc')
    await api.getMembership('0xabc')
    const members = await api.listMembers()

    assert.ok(Array.isArray(members))
    for (const m of members) {
      assert.equal(typeof m.address, 'string')
      assert.ok(Array.isArray(m.roles))
      assert.ok(['free', 'standard', 'pro'].includes(m.tier))
      assert.equal(typeof m.active, 'boolean')
    }
  })

  test('LiveAccessApi returns valid MemberRow[]', async () => {
    stubFetch({ '/v1/members': FIXTURES.members })
    const api = new LiveAccessApi()
    const members = await api.listMembers()

    assert.ok(Array.isArray(members))
    for (const m of members) {
      assert.equal(typeof m.address, 'string')
      assert.ok(Array.isArray(m.roles))
      assert.ok(['free', 'standard', 'pro'].includes(m.tier))
      assert.equal(typeof m.active, 'boolean')
    }
  })

  test('LiveAccessApi maps snake_case backend fields to camelCase view models', async () => {
    stubFetch({ '/v1/members': FIXTURES.members })
    const api = new LiveAccessApi()
    const members = await api.listMembers()

    assert.ok(Array.isArray(members))
    const abc = members.find((m: any) => m.address === '0xabc')
    assert.ok(abc)
    assert.deepEqual(abc.roles, ['member'])
    assert.equal(abc.tier, 'free')
    assert.equal(abc.active, true)

    const def = members.find((m: any) => m.address === '0xdef')
    assert.ok(def)
    assert.deepEqual(def.roles, ['member', 'admin'])
    assert.equal(def.tier, 'standard')
    assert.equal(def.active, true)
  })
})

// ── SIWE endpoints ────────────────────────────────────────────────────────────

describe('SIWE endpoints', () => {
  test('MockAccessApi getNonce returns a hex string', async () => {
    const api = new MockAccessApi('0xabc')
    const nonce = await api.getNonce('0xabc')
    assert.equal(typeof nonce, 'string')
    assert.ok(nonce.length > 0)
  })

  test('LiveAccessApi getNonce returns a nonce string', async () => {
    stubFetch({ '/v1/auth/siwe/nonce': FIXTURES.nonce })
    const api = new LiveAccessApi()
    const nonce = await api.getNonce('0xabc')
    assert.equal(typeof nonce, 'string')
    assert.equal(nonce, 'aabbccdd11223344')
  })

  test('MockAccessApi siweVerify returns a SiweAuthSession', async () => {
    const api = new MockAccessApi('0xabc')
    const nonce = await api.getNonce('0xabc')
    const message = `example.com wants you to sign in with your Ethereum account:\n0xabc\n\nSign in.\n\nURI: https://example.com\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: 2025-01-01T00:00:00.000Z`
    const result = await api.siweVerify(message, 'sig')
    assert.equal(result.isAuthenticated, true)
    assert.equal(typeof result.token, 'string')
    assert.equal(typeof result.address, 'string')
    assert.equal(typeof result.expiresAt, 'string')
  })

  test('LiveAccessApi siweVerify returns a SiweAuthSession', async () => {
    stubFetch({ '/v1/auth/siwe/verify': FIXTURES.siweVerify })
    const api = new LiveAccessApi()
    const result = await api.siweVerify('msg', 'sig')
    assert.equal(result.isAuthenticated, true)
    assert.equal(result.token, 'live-jwt-abcdef123456')
    assert.equal(result.address, '0xabc')
    assert.equal(typeof result.expiresAt, 'string')
  })

  test('both APIs return matching SiweAuthSession shapes', async () => {
    const mockApi = new MockAccessApi('0xabc')
    const nonce = await mockApi.getNonce('0xabc')
    const message = `example.com wants you to sign in with your Ethereum account:\n0xabc\n\nSign in.\n\nURI: https://example.com\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: 2025-01-01T00:00:00.000Z`
    const mockResult = await mockApi.siweVerify(message, 'sig')

    stubFetch({ '/v1/auth/siwe/verify': FIXTURES.siweVerify })
    const liveResult = await new LiveAccessApi('0xabc').siweVerify('msg', 'sig')

    assert.equal(mockResult.isAuthenticated, liveResult.isAuthenticated)
    assert.equal(typeof mockResult.token, typeof liveResult.token)
    assert.equal(typeof mockResult.address, typeof liveResult.address)
    assert.equal(typeof mockResult.expiresAt, typeof liveResult.expiresAt)
  })

  test('MockAccessApi consumes nonce on first verify and rejects reuse', async () => {
    const api = new MockAccessApi('0xabc')
    const nonce = await api.getNonce('0xabc')
    const message = `example.com wants you to sign in with your Ethereum account:\n0xabc\n\nSign in.\n\nURI: https://example.com\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: 2025-01-01T00:00:00.000Z`

    // First use succeeds
    const first = await api.siweVerify(message, '0xsig')
    assert.equal(first.isAuthenticated, true)

    // Second use with same message (same nonce) is rejected
    try {
      await api.siweVerify(message, '0xsig')
      assert.fail('expected siweVerify to throw on nonce reuse')
    } catch (err: any) {
      assert.ok(isApiError(err), `expected ApiError, got ${err?.name}: ${err?.message}`)
      assert.equal(err.code, 'bad_request')
      assert.match(err.safeMessage, /already used/i)
    }
  })

  test('MockAccessApi rejects nonce that was never issued', async () => {
    const api = new MockAccessApi('0xabc')
    const message = 'example.com wants you to sign in with your Ethereum account:\n0xabc\n\nSign in.\n\nURI: https://example.com\nVersion: 1\nChain ID: 1\nNonce: neverissued\nIssued At: 2025-01-01T00:00:00.000Z'

    try {
      await api.siweVerify(message, '0xsig')
      assert.fail('expected siweVerify to throw on unknown nonce')
    } catch (err: any) {
      assert.ok(isApiError(err), `expected ApiError, got ${err?.name}: ${err?.message}`)
      assert.equal(err.code, 'bad_request')
      assert.match(err.safeMessage, /not found/i)
    }
  })

  test('MockAccessApi siweLogout does not throw', async () => {
    const api = new MockAccessApi()
    await assert.doesNotReject(() => api.siweLogout('token'))
  })

  test('LiveAccessApi siweLogout does not throw', async () => {
    stubFetch({ '/v1/auth/siwe/logout': null })
    const api = new LiveAccessApi()
    await assert.doesNotReject(() => api.siweLogout('token'))
  })
})

// ── Interface compatibility (compile-time) ───────────────────────────────────

describe('AccessApi interface compatibility', () => {
  test('MockAccessApi statically satisfies AccessApi', () => {
    const api: AccessApi = new MockAccessApi()
    assert.ok(api)
    assert.equal(typeof api.verifyWallet, 'function')
    assert.equal(typeof api.assignRole, 'function')
    assert.equal(typeof api.siweVerify, 'function')
  })

  test('LiveAccessApi statically satisfies AccessApi', () => {
    const api: AccessApi = new LiveAccessApi()
    assert.ok(api)
    assert.equal(typeof api.verifyWallet, 'function')
    assert.equal(typeof api.assignRole, 'function')
    assert.equal(typeof api.siweVerify, 'function')
  })
})
