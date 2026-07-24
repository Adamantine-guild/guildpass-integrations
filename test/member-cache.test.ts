import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import {
  reconcileMemberRoleCache,
  type MemberCacheClient,
} from '../lib/query/member-cache'
import { queryKeys } from '../lib/query/query-keys'
import type { MemberRow } from '../lib/api/types'

const ALICE: MemberRow = {
  address: '0xAbC0000000000000000000000000000000000001',
  roles: ['member'],
  tier: 'standard',
  active: true,
}

const BOB: MemberRow = {
  address: '0xDef0000000000000000000000000000000000002',
  roles: ['member', 'admin'],
  tier: 'pro',
  active: true,
}

function seedRows(): MemberRow[] {
  return [
    { ...ALICE, roles: [...ALICE.roles] },
    { ...BOB, roles: [...BOB.roles] },
  ]
}

/** The real page's useInfiniteQuery page shape (app/[communitySlug]/admin/members/page.tsx). */
function seedInfinitePage(members: MemberRow[]) {
  return {
    pages: [{ members, nextCursor: undefined, isFallback: true }],
    pageParams: [undefined],
  }
}

/** The real page's composite, filter-dependent query key. */
function membersKey(searchQuery = '') {
  return [...queryKeys.members.all(), { searchQuery }] as const
}

function settle(ms = 30): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Real QueryClient seeded with one or more entries, each with its own
 * counting queryFn and an active observer subscription, so an invalidate
 * actually triggers a refetch for that specific entry.
 */
async function makeRealClient(entries: { key: readonly unknown[]; data: unknown }[]) {
  const fetchCounts = new Map<string, number>()
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    },
  })
  const unsubscribes: Array<() => void> = []

  for (const { key, data } of entries) {
    const keyStr = JSON.stringify(key)
    fetchCounts.set(keyStr, 0)
    const queryFn = async () => {
      fetchCounts.set(keyStr, (fetchCounts.get(keyStr) ?? 0) + 1)
      return data
    }
    await client.fetchQuery({ queryKey: [...key], queryFn })
    client.setQueryData([...key], data)
    const observer = new QueryObserver(client, { queryKey: [...key], queryFn })
    unsubscribes.push(observer.subscribe(() => {}))
  }

  return {
    client,
    getFetchCount: (key: readonly unknown[]) => fetchCounts.get(JSON.stringify(key)) ?? 0,
    cleanup: () => {
      unsubscribes.forEach((u) => u())
      client.clear()
    },
  }
}

/** Counting fake implementing the structural MemberCacheClient interface. */
function makeFakeClient(entries: { key: readonly unknown[]; data: unknown }[]) {
  const store = new Map<string, { key: readonly unknown[]; data: unknown }>(
    entries.map((e) => [JSON.stringify(e.key), e]),
  )
  const setCalls: Array<readonly unknown[]> = []
  const invalidateCalls: Array<readonly unknown[]> = []

  function matching(prefix: readonly unknown[]) {
    return [...store.values()].filter((e) =>
      prefix.every((part, i) => JSON.stringify(e.key[i]) === JSON.stringify(part)),
    )
  }

  const client: MemberCacheClient = {
    getQueriesData: (filters) =>
      matching(filters.queryKey).map((e) => [e.key, e.data] as [readonly unknown[], unknown]),
    setQueriesData: (filters, updater) => {
      for (const e of matching(filters.queryKey)) {
        setCalls.push(e.key)
        e.data = updater(e.data)
      }
      return undefined
    },
    invalidateQueries: (filters) => {
      invalidateCalls.push(filters.queryKey)
    },
  }

  return {
    client,
    getData: (key: readonly unknown[]) => store.get(JSON.stringify(key))?.data,
    setCalls,
    invalidateCalls,
  }
}

function rolesOf(rows: MemberRow[], address: string): string[] | undefined {
  return rows.find((r) => r.address.toLowerCase() === address.toLowerCase())?.roles
}

describe('reconcileMemberRoleCache', () => {
  it('assign patches a plain-array cache entry without refetching', async () => {
    const key = queryKeys.members.all()
    const { client, getFetchCount, cleanup } = await makeRealClient([{ key, data: seedRows() }])
    try {
      const result = reconcileMemberRoleCache(client, {
        address: ALICE.address,
        role: 'moderator',
        action: 'assign',
      })
      assert.equal(result, 'patched')

      const rows = client.getQueryData<MemberRow[]>([...key])
      assert.ok(rows)
      assert.deepEqual(rolesOf(rows, ALICE.address), ['member', 'moderator'])

      await settle()
      assert.equal(getFetchCount(key), 1)
    } finally {
      cleanup()
    }
  })

  it('assign patches the REAL composite-keyed, paginated useInfiniteQuery entry without refetching', async () => {
    const key = membersKey()
    const { client, getFetchCount, cleanup } = await makeRealClient([
      { key, data: seedInfinitePage(seedRows()) },
    ])
    try {
      const result = reconcileMemberRoleCache(client, {
        address: ALICE.address,
        role: 'moderator',
        action: 'assign',
      })
      assert.equal(result, 'patched')

      const cached = client.getQueryData<{ pages: { members: MemberRow[] }[] }>([...key])
      assert.ok(cached)
      assert.deepEqual(rolesOf(cached.pages[0].members, ALICE.address), ['member', 'moderator'])
      // Sibling row untouched.
      assert.deepEqual(rolesOf(cached.pages[0].members, BOB.address), ['member', 'admin'])

      await settle()
      assert.equal(getFetchCount(key), 1, 'a successful mutation must not trigger a refetch')
    } finally {
      cleanup()
    }
  })

  it('remove-role patches the paginated useInfiniteQuery entry without refetching', async () => {
    const key = membersKey()
    const { client, getFetchCount, cleanup } = await makeRealClient([
      { key, data: seedInfinitePage(seedRows()) },
    ])
    try {
      const result = reconcileMemberRoleCache(client, {
        address: BOB.address,
        role: 'admin',
        action: 'remove',
      })
      assert.equal(result, 'patched')

      const cached = client.getQueryData<{ pages: { members: MemberRow[] }[] }>([...key])
      assert.ok(cached)
      assert.deepEqual(rolesOf(cached.pages[0].members, BOB.address), ['member'])

      await settle()
      assert.equal(getFetchCount(key), 1)
    } finally {
      cleanup()
    }
  })

  it('patches every matching entry at once — bare key and composite key together', () => {
    const bareKey = queryKeys.members.all()
    const compositeKey = membersKey('some filter')
    const fake = makeFakeClient([
      { key: bareKey, data: seedRows() },
      { key: compositeKey, data: seedInfinitePage(seedRows()) },
    ])

    const result = reconcileMemberRoleCache(fake.client, {
      address: ALICE.address,
      role: 'moderator',
      action: 'assign',
    })
    assert.equal(result, 'patched')

    const plain = fake.getData(bareKey) as MemberRow[]
    assert.deepEqual(rolesOf(plain, ALICE.address), ['member', 'moderator'])

    const infinite = fake.getData(compositeKey) as { pages: { members: MemberRow[] }[] }
    assert.deepEqual(rolesOf(infinite.pages[0].members, ALICE.address), ['member', 'moderator'])
  })

  it('missing cache entry falls back to invalidate, never a silent no-op', async () => {
    const fake = makeFakeClient([])
    const result = reconcileMemberRoleCache(fake.client, {
      address: ALICE.address,
      role: 'moderator',
      action: 'assign',
    })
    assert.equal(result, 'invalidated')
    assert.equal(fake.setCalls.length, 0)
    assert.equal(fake.invalidateCalls.length, 1)
    assert.deepEqual(fake.invalidateCalls[0], ['members'])

    // A real, completely empty client must not throw either.
    const empty = new QueryClient()
    assert.equal(
      reconcileMemberRoleCache(empty, {
        address: ALICE.address,
        role: 'moderator',
        action: 'assign',
      }),
      'invalidated',
    )
    empty.clear()
  })

  it('assigning to an address absent from every cache entry falls back to invalidate rather than fabricating a placeholder row', () => {
    const key = membersKey()
    const fake = makeFakeClient([{ key, data: seedInfinitePage(seedRows()) }])
    const newAddress = '0x1230000000000000000000000000000000000003'

    const result = reconcileMemberRoleCache(fake.client, {
      address: newAddress,
      role: 'member',
      action: 'assign',
    })

    assert.equal(result, 'invalidated')
    assert.equal(fake.setCalls.length, 0)
    assert.deepEqual(fake.invalidateCalls, [['members']])
    // The cache is untouched — no fabricated { tier: 'free', active: true }
    // guess left behind for a fetch to (never) correct.
    const cached = fake.getData(key) as { pages: { members: MemberRow[] }[] }
    assert.equal(cached.pages[0].members.length, 2)
  })

  it('an address present in one filtered entry but absent from another patches the first and leaves the second untouched (no fabricated row)', () => {
    const allKey = membersKey()
    const filteredKey = membersKey('bob-only')
    const fake = makeFakeClient([
      { key: allKey, data: seedInfinitePage(seedRows()) },
      { key: filteredKey, data: seedInfinitePage([{ ...BOB, roles: [...BOB.roles] }]) },
    ])

    const result = reconcileMemberRoleCache(fake.client, {
      address: ALICE.address,
      role: 'moderator',
      action: 'assign',
    })
    assert.equal(result, 'patched')

    const all = fake.getData(allKey) as { pages: { members: MemberRow[] }[] }
    assert.deepEqual(rolesOf(all.pages[0].members, ALICE.address), ['member', 'moderator'])

    // Alice was never in the "bob-only" filtered view — she must not have
    // been fabricated into it.
    const filtered = fake.getData(filteredKey) as { pages: { members: MemberRow[] }[] }
    assert.equal(filtered.pages[0].members.length, 1)
    assert.equal(filtered.pages[0].members[0].address, BOB.address)
  })

  it('non-array, non-paginated cached value is left alone and does not crash', () => {
    const key = membersKey()
    const fake = makeFakeClient([{ key, data: { unexpected: 'shape' } }])
    const result = reconcileMemberRoleCache(fake.client, {
      address: ALICE.address,
      role: 'moderator',
      action: 'assign',
    })
    assert.equal(result, 'invalidated')
    assert.deepEqual(fake.invalidateCalls, [['members']])
  })

  it('double assign of the same role is idempotent', () => {
    const key = membersKey()
    const fake = makeFakeClient([{ key, data: seedInfinitePage(seedRows()) }])
    const input = { address: ALICE.address, role: 'moderator', action: 'assign' } as const
    assert.equal(reconcileMemberRoleCache(fake.client, input), 'patched')
    assert.equal(reconcileMemberRoleCache(fake.client, input), 'patched')
    const cached = fake.getData(key) as { pages: { members: MemberRow[] }[] }
    assert.deepEqual(rolesOf(cached.pages[0].members, ALICE.address), ['member', 'moderator'])
    assert.equal(cached.pages[0].members.length, 2)
  })

  it('matches addresses case-insensitively (no duplicate row appended)', () => {
    const key = membersKey()
    const fake = makeFakeClient([{ key, data: seedInfinitePage(seedRows()) }])
    const result = reconcileMemberRoleCache(fake.client, {
      address: ALICE.address.toUpperCase().replace('0X', '0x'),
      role: 'moderator',
      action: 'assign',
    })
    assert.equal(result, 'patched')
    const cached = fake.getData(key) as { pages: { members: MemberRow[] }[] }
    assert.equal(cached.pages[0].members.length, 2)
    assert.deepEqual(rolesOf(cached.pages[0].members, ALICE.address), ['member', 'moderator'])
  })
})
