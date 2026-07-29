import './setup-env'
import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import { filterMembers, memberMatchesFilters, type MemberFilters } from '../lib/members/filter-members'
import type { MemberRow } from '../lib/api/types'

function member(overrides: Partial<MemberRow> & { address: string }): MemberRow {
  return {
    roles: ['member'],
    tier: 'free',
    active: true,
    ...overrides,
  }
}

const NO_FILTER: MemberFilters = { search: '', role: 'all', tier: 'all' }

describe('filterMembers — search', () => {
  test('matches a partial wallet address', () => {
    const ada = member({ address: '0xAbCdEf0000000000000000000000000000000001', displayName: 'Not Matching Name' })
    const grace = member({ address: '0x1111111111111111111111111111111111111111', displayName: 'Also Not Matching' })
    const result = filterMembers([ada, grace], { ...NO_FILTER, search: 'bcde' })
    assert.deepEqual(result.map((m) => m.address), [ada.address])
  })

  test('matches a partial display name', () => {
    const ada = member({ address: '0x0000000000000000000000000000000000000001', displayName: 'Ada Lovelace' })
    const grace = member({ address: '0x0000000000000000000000000000000000000002', displayName: 'Grace Hopper' })
    const result = filterMembers([ada, grace], { ...NO_FILTER, search: 'lace' })
    assert.deepEqual(result.map((m) => m.displayName), ['Ada Lovelace'])
  })

  test('search is case-insensitive for both address and name', () => {
    const ada = member({ address: '0xABCDEF0000000000000000000000000000000001', displayName: 'Ada Lovelace' })
    const byAddress = filterMembers([ada], { ...NO_FILTER, search: 'abcdef' })
    const byName = filterMembers([ada], { ...NO_FILTER, search: 'ADA LOVELACE' })
    assert.equal(byAddress.length, 1)
    assert.equal(byName.length, 1)
  })

  test('trims leading and trailing whitespace from the search term', () => {
    const ada = member({ address: '0x0000000000000000000000000000000000000001', displayName: 'Ada Lovelace' })
    const result = filterMembers([ada], { ...NO_FILTER, search: '   ada   ' })
    assert.equal(result.length, 1)
  })

  test('an empty (or whitespace-only) search returns every member, subject to role/tier', () => {
    const members = [
      member({ address: '0x01', displayName: 'One' }),
      member({ address: '0x02', displayName: 'Two' }),
    ]
    assert.equal(filterMembers(members, { ...NO_FILTER, search: '' }).length, 2)
    assert.equal(filterMembers(members, { ...NO_FILTER, search: '   ' }).length, 2)
  })
})

describe('filterMembers — role', () => {
  test('"all" shows members regardless of role', () => {
    const members = [
      member({ address: '0x01', roles: ['member'] }),
      member({ address: '0x02', roles: ['admin'] }),
    ]
    assert.equal(filterMembers(members, { ...NO_FILTER, role: 'all' }).length, 2)
  })

  test('a specific role excludes members who do not have it', () => {
    const moderator = member({ address: '0x01', roles: ['moderator'] })
    const plainMember = member({ address: '0x02', roles: ['member'] })
    const result = filterMembers([moderator, plainMember], { ...NO_FILTER, role: 'moderator' })
    assert.deepEqual(result.map((m) => m.address), [moderator.address])
  })

  test('matches when the role is any one of a member\'s multiple roles', () => {
    const multiRole = member({ address: '0x01', roles: ['member', 'admin'] })
    const result = filterMembers([multiRole], { ...NO_FILTER, role: 'admin' })
    assert.equal(result.length, 1)
  })

  test('a member with an empty roles array never matches a specific role filter, but matches "all"', () => {
    const noRoles = member({ address: '0x01', roles: [] })
    assert.equal(filterMembers([noRoles], { ...NO_FILTER, role: 'member' }).length, 0)
    assert.equal(filterMembers([noRoles], { ...NO_FILTER, role: 'all' }).length, 1)
    assert.doesNotThrow(() => memberMatchesFilters(noRoles, { ...NO_FILTER, role: 'admin' }))
  })
})

describe('filterMembers — tier', () => {
  test('"all" shows members regardless of tier', () => {
    const members = [member({ address: '0x01', tier: 'free' }), member({ address: '0x02', tier: 'pro' })]
    assert.equal(filterMembers(members, { ...NO_FILTER, tier: 'all' }).length, 2)
  })

  test('a specific tier matches exactly and excludes other tiers', () => {
    const pro = member({ address: '0x01', tier: 'pro' })
    const free = member({ address: '0x02', tier: 'free' })
    const result = filterMembers([pro, free], { ...NO_FILTER, tier: 'pro' })
    assert.deepEqual(result.map((m) => m.address), [pro.address])
  })

  test('an unrecognized tier value is excluded from a specific filter (never reclassified) but matches "all"', () => {
    const weirdTier = member({ address: '0x01', tier: 'unknown-tier' as unknown as MemberRow['tier'] })
    assert.equal(filterMembers([weirdTier], { ...NO_FILTER, tier: 'free' }).length, 0)
    assert.equal(filterMembers([weirdTier], { ...NO_FILTER, tier: 'pro' }).length, 0)
    assert.equal(filterMembers([weirdTier], { ...NO_FILTER, tier: 'all' }).length, 1)
  })
})

describe('filterMembers — combined filters (AND across groups)', () => {
  test('a member must satisfy search, role, and tier simultaneously', () => {
    const target = member({ address: '0x0000000000000000000000000000000000000001', displayName: 'Ada Lovelace', roles: ['admin'], tier: 'pro' })
    const wrongRole = member({ address: '0x0000000000000000000000000000000000000002', displayName: 'Ada Clone', roles: ['member'], tier: 'pro' })
    const wrongTier = member({ address: '0x0000000000000000000000000000000000000003', displayName: 'Ada Twin', roles: ['admin'], tier: 'free' })
    const wrongSearch = member({ address: '0x0000000000000000000000000000000000000004', displayName: 'Grace Hopper', roles: ['admin'], tier: 'pro' })

    const result = filterMembers([target, wrongRole, wrongTier, wrongSearch], {
      search: 'ada lovelace',
      role: 'admin',
      tier: 'pro',
    })

    assert.deepEqual(result.map((m) => m.address), [target.address])
  })

  test('produces an empty result when no member satisfies every active filter', () => {
    const members = [
      member({ address: '0x01', roles: ['member'], tier: 'free' }),
      member({ address: '0x02', roles: ['admin'], tier: 'standard' }),
    ]
    const result = filterMembers(members, { search: '', role: 'admin', tier: 'free' })
    assert.deepEqual(result, [])
  })
})

describe('filterMembers — ordering and immutability', () => {
  test('preserves the original relative order of surviving members', () => {
    const members = [
      member({ address: '0x03', roles: ['member'] }),
      member({ address: '0x01', roles: ['member'] }),
      member({ address: '0x02', roles: ['member'] }),
    ]
    const result = filterMembers(members, NO_FILTER)
    assert.deepEqual(result.map((m) => m.address), ['0x03', '0x01', '0x02'])
  })

  test('does not mutate the input array or its members', () => {
    const members = [member({ address: '0x01', roles: ['member'] }), member({ address: '0x02', roles: ['admin'] })]
    const snapshot = JSON.parse(JSON.stringify(members))
    const result = filterMembers(members, { ...NO_FILTER, role: 'admin' })
    assert.deepEqual(members, snapshot)
    assert.notEqual(result, members)
  })
})

describe('filterMembers — live-style data with missing optional fields', () => {
  test('a member with no displayName does not crash and only matches by address', () => {
    const noName: MemberRow = { address: '0x0000000000000000000000000000000000000abc', roles: ['member'], tier: 'free', active: true }
    assert.doesNotThrow(() => filterMembers([noName], { ...NO_FILTER, search: 'abc' }))
    assert.equal(filterMembers([noName], { ...NO_FILTER, search: 'abc' }).length, 1)
    assert.equal(filterMembers([noName], { ...NO_FILTER, search: 'nonexistent-name' }).length, 0)
  })

  test('a member with roles omitted at runtime (backend shape drift) does not crash', () => {
    const malformed = { address: '0x01', tier: 'free', active: true } as unknown as MemberRow
    assert.doesNotThrow(() => filterMembers([malformed], { ...NO_FILTER, role: 'member' }))
    assert.equal(filterMembers([malformed], { ...NO_FILTER, role: 'member' }).length, 0)
  })
})
