import './setup-env'
import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import { MockAccessApi } from '../lib/api/mock'
import { ROLE_FILTER_OPTIONS, TIER_FILTER_OPTIONS } from '../lib/members/filter-members'
import type { MemberRow } from '../lib/api/types'

describe('mock member seed data variety (search/filter feature)', () => {
  test('listMembers() exposes a displayName for search-by-name to match against', async () => {
    const api = new MockAccessApi()
    const result = await api.listMembers()
    assert.ok(Array.isArray(result))
    const withNames = (result as MemberRow[]).filter((m) => typeof m.displayName === 'string' && m.displayName.length > 0)
    assert.ok(withNames.length > 0, 'expected at least some seeded members to carry a displayName')
  })

  test('seed data covers every canonical tier', async () => {
    const api = new MockAccessApi()
    const result = (await api.listMembers()) as MemberRow[]
    for (const tier of TIER_FILTER_OPTIONS) {
      assert.ok(result.some((m) => m.tier === tier), `expected at least one seeded member with tier "${tier}"`)
    }
  })

  test('seed data covers every canonical role', async () => {
    const api = new MockAccessApi()
    const result = (await api.listMembers()) as MemberRow[]
    for (const role of ROLE_FILTER_OPTIONS) {
      assert.ok(result.some((m) => m.roles.includes(role)), `expected at least one seeded member with role "${role}"`)
    }
  })

  test('seed data includes at least one multi-role member', async () => {
    const api = new MockAccessApi()
    const result = (await api.listMembers()) as MemberRow[]
    assert.ok(result.some((m) => m.roles.length > 1), 'expected at least one seeded member with more than one role')
  })

  test('seed addresses remain unique (no duplicates introduced)', async () => {
    const api = new MockAccessApi()
    const result = (await api.listMembers()) as MemberRow[]
    const addresses = result.map((m) => m.address)
    assert.equal(new Set(addresses).size, addresses.length)
  })
})
