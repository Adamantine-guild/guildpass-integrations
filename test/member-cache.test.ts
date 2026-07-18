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

function settle(ms = 30): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Real QueryClient with a counting queryFn and an active observer
 * subscription, so an invalidate actually triggers a refetch.
 */
async function makeRealClient(rows: MemberRow[]) {
  let fetchCount = 0
  const queryFn = async (): Promise<MemberRow[]> => {
    fetchCount += 1
    return seedRows()
  }
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    },
  })
  await client.fetchQuery({ queryKey: queryKeys.members.all, queryFn })
  client.setQueryData<MemberRow[]>(queryKeys.members.all, rows)
  const observer = new QueryObserver<MemberRow[]>(client, {
    queryKey: queryKeys.members.all,
    queryFn,
  })
  const unsubscribe = observer.subscribe(() => {})
  return {
    client,
    getFetchCount: () => fetchCount,
    cleanup: () => {
      unsubscribe()
      client.clear()
    },
  }
}

/** Counting fake implementing the structural MemberCacheClient interface. */
function makeFakeClient(initialData?: unknown) {
  const setCalls: Array<readonly unknown[]> = []
  const invalidateCalls: Array<readonly unknown[]> = []
  let data = initialData
  const client: MemberCacheClient = {
    getQueryData: () => data,
    setQueryData: (queryKey, updater) => {
      setCalls.push(queryKey)
      data = updater(data as MemberRow[] | undefined)
      return data
    },
    invalidateQueries: (filters) => {
      invalidateCalls.push(filters.queryKey)
    },
  }
  return {
    client,
    getData: () => data,
    setCalls,
    invalidateCalls,
  }
}

function rolesOf(rows: MemberRow[], address: string): string[] | undefined {
  return rows.find((r) => r.address.toLowerCase() === address.toLowerCase())?.roles
}

describe('reconcileMemberRoleCache', () => {
  it('assign patches the cached row without refetching (queryFn called exactly once)', async () => {
    const { client, getFetchCount, cleanup } = await makeRealClient(seedRows())
    try {
      const result = reconcileMemberRoleCache(client, {
        address: ALICE.address,
        role: 'moderator',
        action: 'assign',
      })
      assert.equal(result, 'patched')

      const rows = client.getQueryData<MemberRow[]>(queryKeys.members.all)
      assert.ok(rows)
      assert.deepEqual(rolesOf(rows, ALICE.address), ['member', 'moderator'])

      await settle()
      assert.equal(getFetchCount(), 1)
    } finally {
      cleanup()
    }
  })

  it('control: a full invalidate DOES refetch the active query', async () => {
    const { client, getFetchCount, cleanup } = await makeRealClient(seedRows())
    try {
      assert.equal(getFetchCount(), 1)
      void client.invalidateQueries({ queryKey: queryKeys.members.all })
      await settle()
      assert.equal(getFetchCount(), 2)
    } finally {
      cleanup()
    }
  })

  it('remove-role patches the cached row without refetching', async () => {
    const { client, getFetchCount, cleanup } = await makeRealClient(seedRows())
    try {
      const result = reconcileMemberRoleCache(client, {
        address: BOB.address,
        role: 'admin',
        action: 'remove',
      })
      assert.equal(result, 'patched')

      const rows = client.getQueryData<MemberRow[]>(queryKeys.members.all)
      assert.ok(rows)
      assert.deepEqual(rolesOf(rows, BOB.address), ['member'])

      await settle()
      assert.equal(getFetchCount(), 1)
    } finally {
      cleanup()
    }
  })

  it('missing cache entry falls back to invalidate, never a silent no-op', async () => {
    const fake = makeFakeClient(undefined)
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

  it('non-array cached value falls back to invalidate without crashing', () => {
    const fake = makeFakeClient({ pages: [] })
    const result = reconcileMemberRoleCache(fake.client, {
      address: ALICE.address,
      role: 'moderator',
      action: 'assign',
    })
    assert.equal(result, 'invalidated')
    assert.equal(fake.setCalls.length, 0)
    assert.deepEqual(fake.invalidateCalls, [['members']])
    assert.deepEqual(fake.getData(), { pages: [] })
  })

  it('double assign of the same role is idempotent', () => {
    const fake = makeFakeClient(seedRows())
    const input = { address: ALICE.address, role: 'moderator', action: 'assign' } as const
    assert.equal(reconcileMemberRoleCache(fake.client, input), 'patched')
    assert.equal(reconcileMemberRoleCache(fake.client, input), 'patched')
    const rows = fake.getData() as MemberRow[]
    assert.deepEqual(rolesOf(rows, ALICE.address), ['member', 'moderator'])
    assert.equal(rows.length, 2)
  })

  it('matches addresses case-insensitively (no duplicate row appended)', () => {
    const fake = makeFakeClient(seedRows())
    const result = reconcileMemberRoleCache(fake.client, {
      address: ALICE.address.toUpperCase().replace('0X', '0x'),
      role: 'moderator',
      action: 'assign',
    })
    assert.equal(result, 'patched')
    const rows = fake.getData() as MemberRow[]
    assert.equal(rows.length, 2)
    assert.deepEqual(rolesOf(rows, ALICE.address), ['member', 'moderator'])
  })

  it('assigning to an unknown address appends a default row', () => {
    const fake = makeFakeClient(seedRows())
    const newAddress = '0x1230000000000000000000000000000000000003'
    const result = reconcileMemberRoleCache(fake.client, {
      address: newAddress,
      role: 'member',
      action: 'assign',
    })
    assert.equal(result, 'patched')
    const rows = fake.getData() as MemberRow[]
    assert.equal(rows.length, 3)
    assert.deepEqual(rows[2], {
      address: newAddress,
      roles: ['member'],
      tier: 'free',
      active: true,
    })
  })
})
