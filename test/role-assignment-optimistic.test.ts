import './setup-env'
import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/react-query'
import { MockAccessApi, resetMockData, setMockRoleMutationFailure } from '../lib/api/mock'
import { isApiError } from '../lib/api/errors'
import { applyOptimisticRole } from '../lib/api/optimistic'
import { reconcileMemberRoleCache } from '../lib/query/member-cache'
import { queryKeys } from '../lib/query/query-keys'
import type { MemberRow, Role } from '../lib/api/types'

/**
 * Integration tests for issue #243 — optimistic role assignment.
 *
 * These wire together the REAL pieces the page's assignRole mutation uses
 * (a real QueryClient, the real MockAccessApi, the real optimistic reducer,
 * and the real reconciliation function) against the actual composite,
 * paginated cache shape the page caches under
 * (`[...queryKeys.members.all(), { searchQuery }]`, a `useInfiniteQuery`
 * `{ pages: [...] }` shape) — not a simplified stand-in. No React rendering,
 * matching the integration style already established in
 * test/member-cache.test.ts.
 */

const ADDRESS = '0xAbC0000000000000000000000000000000000001'

function membersKey(searchQuery = '') {
  return [...queryKeys.members.all(), { searchQuery }] as const
}

function seedInfinitePage(members: MemberRow[]) {
  return {
    pages: [{ members, nextCursor: undefined, isFallback: true }],
    pageParams: [undefined],
  }
}

function rolesOf(cached: any, address: string): string[] | undefined {
  const members: MemberRow[] = cached?.pages?.[0]?.members ?? []
  return members.find((m) => m.address.toLowerCase() === address.toLowerCase())?.roles
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Reproduces the onMutate/onSuccess/onError orchestration from
 * app/admin/members/page.tsx's assignRole mutation exactly: cancel + snapshot,
 * optimistic patch, run the mutation, reconcile on success or restore the
 * snapshot on failure.
 */
async function assignRoleOptimistically(
  qc: QueryClient,
  mutationFn: () => Promise<void>,
  input: { address: string; role: Role },
): Promise<{ outcome: 'success' } | { outcome: 'error'; error: unknown }> {
  await qc.cancelQueries({ queryKey: queryKeys.members.all() })
  const previousQueries = qc.getQueriesData({ queryKey: queryKeys.members.all() })

  qc.setQueriesData({ queryKey: queryKeys.members.all() }, (old: any) => {
    if (!old) return old
    if (Array.isArray(old)) return applyOptimisticRole(old, input.address, input.role)
    if (old.pages) {
      return {
        ...old,
        pages: old.pages.map((page: any) => ({
          ...page,
          members: applyOptimisticRole(page.members, input.address, input.role),
        })),
      }
    }
    return old
  })

  try {
    await mutationFn()
    reconcileMemberRoleCache(qc, { address: input.address, role: input.role, action: 'assign' })
    return { outcome: 'success' }
  } catch (error) {
    for (const [key, data] of previousQueries) {
      qc.setQueryData(key, data)
    }
    return { outcome: 'error', error }
  }
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

describe('Optimistic role assignment integration (#243)', () => {
  beforeEach(async () => {
    await resetMockData()
    setMockRoleMutationFailure(false)
  })

  test('the role change appears in the cache instantly, before the mutation round-trip resolves', async () => {
    const qc = makeClient()
    const key = membersKey()
    qc.setQueryData(key, seedInfinitePage([
      { address: ADDRESS, roles: ['member'], tier: 'standard', active: true },
    ]))
    const api = new MockAccessApi(ADDRESS)
    const slowMutation = () => delay(50).then(() => api.assignRole(ADDRESS, 'moderator'))

    const pending = assignRoleOptimistically(qc, slowMutation, { address: ADDRESS, role: 'moderator' })

    // Give cancelQueries + the synchronous optimistic patch a moment to run,
    // while staying well inside the mutation's artificial 50ms delay.
    await delay(10)
    assert.deepEqual(
      rolesOf(qc.getQueryData(key), ADDRESS),
      ['member', 'moderator'],
      'the role must be visible before the mutation has resolved',
    )

    const result = await pending
    assert.equal(result.outcome, 'success')
    qc.clear()
  })

  test('a simulated mock-mode failure rolls back the optimistic change and reports an error', async () => {
    const qc = makeClient()
    const key = membersKey()
    const initial = seedInfinitePage([
      { address: ADDRESS, roles: ['member'], tier: 'standard', active: true },
    ])
    qc.setQueryData(key, initial)
    const api = new MockAccessApi(ADDRESS)

    setMockRoleMutationFailure(true)
    const result = await assignRoleOptimistically(
      qc,
      () => api.assignRole(ADDRESS, 'moderator'),
      { address: ADDRESS, role: 'moderator' },
    )

    assert.equal(result.outcome, 'error')
    assert.ok(result.outcome === 'error' && isApiError(result.error) && result.error.status === 500)

    assert.deepEqual(
      qc.getQueryData(key),
      initial,
      'the cache must be restored to the exact pre-mutation snapshot',
    )
    qc.clear()
  })

  test('no duplicate or ghost roles remain after a deliberately-delayed successful mutation', async () => {
    const qc = makeClient()
    const key = membersKey()
    qc.setQueryData(key, seedInfinitePage([
      { address: ADDRESS, roles: ['member'], tier: 'standard', active: true },
    ]))
    const api = new MockAccessApi(ADDRESS)
    const slowMutation = () => delay(50).then(() => api.assignRole(ADDRESS, 'moderator'))

    const result = await assignRoleOptimistically(qc, slowMutation, {
      address: ADDRESS,
      role: 'moderator',
    })
    assert.equal(result.outcome, 'success')

    const cached = qc.getQueryData<any>(key)
    const allMembers = cached.pages.flatMap((p: any) => p.members as MemberRow[])
    const matches = allMembers.filter(
      (m: MemberRow) => m.address.toLowerCase() === ADDRESS.toLowerCase(),
    )
    assert.equal(matches.length, 1, 'exactly one row for this address — no duplicate/ghost rows')
    assert.deepEqual(matches[0].roles, ['member', 'moderator'])
    qc.clear()
  })
})
