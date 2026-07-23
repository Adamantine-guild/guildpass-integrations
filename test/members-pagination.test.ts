import { describe, test, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { LiveAccessApi } from '../lib/api/live'
import { MockAccessApi } from '../lib/api/mock'
import type { BackendMember } from '../lib/api/types'

function stubFetch(response: unknown, status = 200) {
  global.fetch = async (input: RequestInfo | URL) => {
    const url = String(input)
    return new Response(JSON.stringify(response), { status }) as any
  }
}

afterEach(() => {
  delete (global as any).fetch
})

describe('LiveAccessApi listMembers capability detection', () => {
  test('returns flat MemberRow[] when backend returns old-style array response', async () => {
    const rawBackendArray: BackendMember[] = [
      { wallet_address: '0x111', membership_tier: 'pro', is_active: true, roles: ['member'] },
      { wallet_address: '0x222', membership_tier: 'free', is_active: false, roles: ['member'] },
    ]
    stubFetch(rawBackendArray)

    const api = new LiveAccessApi()
    const result = await api.listMembers()

    assert.ok(Array.isArray(result))
    assert.equal(result.length, 2)
    assert.equal(result[0].address, '0x111')
    assert.equal(result[0].tier, 'pro')
    assert.equal(result[0].active, true)
  })

  test('returns PaginatedMembers when backend returns new-style object response', async () => {
    const rawBackendPaged = {
      members: [
        { wallet_address: '0x333', membership_tier: 'standard', is_active: true, roles: ['member'] },
      ],
      nextCursor: '100',
    }
    stubFetch(rawBackendPaged)

    const api = new LiveAccessApi()
    const result = await api.listMembers({ cursor: '0', limit: 1 })

    assert.ok(!Array.isArray(result))
    assert.ok('members' in result)
    assert.equal(result.members.length, 1)
    assert.equal(result.members[0].address, '0x333')
    assert.equal(result.members[0].tier, 'standard')
    assert.equal(result.nextCursor, '100')
  })
})

describe('MockAccessApi listMembers behavior', () => {
  test('returns flat list of 50000+ members when called without arguments', async () => {
    const api = new MockAccessApi()
    const result = await api.listMembers()

    assert.ok(Array.isArray(result))
    assert.ok(result.length >= 50000)
    assert.equal(result[0].address, '0x0000000000000000000000000000000000000001')
  })

  test('returns paginated members and nextCursor when arguments are provided', async () => {
    const api = new MockAccessApi()
    const result = await api.listMembers({ limit: 10 })

    assert.ok(!Array.isArray(result))
    assert.equal(result.members.length, 10)
    assert.equal(result.nextCursor, '10')
  })

  test('filters mock members by address', async () => {
    const api = new MockAccessApi()
    // Search for a specific address
    const result = await api.listMembers({ filter: '0000000000000000000000000000000000000005' })

    assert.ok(!Array.isArray(result))
    assert.equal(result.members.length, 1)
    assert.equal(result.members[0].address, '0x0000000000000000000000000000000000000005')
  })
})
