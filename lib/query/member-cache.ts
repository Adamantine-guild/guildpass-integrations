import { applyOptimisticRole, applyOptimisticRemoveRole } from '../api/optimistic'
import type { MemberRow, Role } from '../api/types'
import { queryKeys } from './query-keys'

export type MemberRoleAction = 'assign' | 'remove'

export type MemberCacheReconcileResult = 'patched' | 'invalidated'

/**
 * Minimal structural subset of a React Query `QueryClient` — lets callers pass
 * the real client while tests can substitute a counting fake.
 */
export interface MemberCacheClient {
  getQueryData(queryKey: readonly unknown[]): unknown
  setQueryData(
    queryKey: readonly unknown[],
    updater: (current: MemberRow[] | undefined) => MemberRow[],
  ): unknown
  invalidateQueries(filters: { queryKey: readonly unknown[] }): unknown
}

/**
 * Surgically reconcile the cached member list after a successful role
 * mutation instead of refetching `/v1/members` (issue #146).
 *
 * If the `['members']` cache entry holds a usable `MemberRow[]`, the row is
 * patched in place with the same pure reducers used for the optimistic
 * update, and no network request is made. If the entry is missing, was
 * GC'd mid-flight, or has an unexpected shape, the function falls back to a
 * full `invalidateQueries` so the list is refetched authoritatively —
 * never a silent no-op.
 *
 * Deliberately patches only the exact `queryKeys.members.all` key rather
 * than prefix-matching with `setQueriesData`: a prefix match would run the
 * array reducer over future keyed/paginated entries (e.g. `InfiniteData`
 * shapes) and corrupt them. When pagination/filtering lands (issues #8/#9),
 * extend this function to reconcile those entries explicitly.
 */
export function reconcileMemberRoleCache(
  client: MemberCacheClient,
  input: { address: string; role: Role; action: MemberRoleAction },
): MemberCacheReconcileResult {
  const cached = client.getQueryData(queryKeys.members.all)

  if (!Array.isArray(cached)) {
    void client.invalidateQueries({ queryKey: queryKeys.members.all })
    return 'invalidated'
  }

  const apply = input.action === 'assign' ? applyOptimisticRole : applyOptimisticRemoveRole
  client.setQueryData(queryKeys.members.all, (current) =>
    apply(current, input.address, input.role),
  )
  return 'patched'
}
