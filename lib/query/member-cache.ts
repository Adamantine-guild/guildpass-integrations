import { applyOptimisticRole, applyOptimisticRemoveRole } from '../api/optimistic'
import type { MemberRow, Role } from '../api/types'
import { queryKeys } from './query-keys'

export type MemberRoleAction = 'assign' | 'remove'

export type MemberCacheReconcileResult = 'patched' | 'invalidated'

interface InfiniteMembersPage {
  members: MemberRow[]
  [key: string]: unknown
}

interface InfiniteMembersData {
  pages: InfiniteMembersPage[]
  [key: string]: unknown
}

function isInfiniteMembersData(value: unknown): value is InfiniteMembersData {
  return (
    !!value &&
    typeof value === 'object' &&
    Array.isArray((value as InfiniteMembersData).pages)
  )
}

function hasAddress(members: MemberRow[], address: string): boolean {
  const lower = address.toLowerCase()
  return members.some((m) => m.address.toLowerCase() === lower)
}

function entryHasAddress(data: unknown, address: string): boolean {
  if (Array.isArray(data)) return hasAddress(data as MemberRow[], address)
  if (isInfiniteMembersData(data)) {
    return data.pages.some((page) => hasAddress(page.members ?? [], address))
  }
  return false
}

/**
 * Patches a single member list. For 'assign', only patches in place — it
 * never fabricates a placeholder row into a list that doesn't already
 * contain this address. Fabricating a `{ tier: 'free', active: true }`
 * guess is only correct for the single query the admin is actively looking
 * at (handled separately by the page's `onMutate`); blasting the same
 * fabrication across every cached entry — including other, differently
 * filtered pages that correctly don't include this member — would inject
 * wrong data into views that were never optimistic in the first place.
 * 'remove' needs no such guard: filtering roles on a non-matching member is
 * already a no-op.
 */
function patchMembersList(
  members: MemberRow[] | undefined,
  address: string,
  role: Role,
  action: MemberRoleAction,
): MemberRow[] {
  const list = members ?? []
  if (action === 'remove') {
    return applyOptimisticRemoveRole(list, address, role)
  }
  if (!hasAddress(list, address)) return list
  return applyOptimisticRole(list, address, role)
}

function patchEntryData(
  data: unknown,
  address: string,
  role: Role,
  action: MemberRoleAction,
): unknown {
  if (Array.isArray(data)) {
    return patchMembersList(data as MemberRow[], address, role, action)
  }
  if (isInfiniteMembersData(data)) {
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        members: patchMembersList(page.members, address, role, action),
      })),
    }
  }
  return data
}

/**
 * Minimal structural subset of a React Query `QueryClient` — lets callers
 * pass the real client while tests can substitute a counting fake.
 *
 * Uses the prefix-matching `getQueriesData`/`setQueriesData` pair (not the
 * exact-match `getQueryData`/`setQueryData`): the real member list is cached
 * under a composite, filter-dependent key —
 * `[...queryKeys.members.all(community), { searchQuery }]`, a
 * `useInfiniteQuery` `{ pages: [...] }` shape — not the bare
 * `queryKeys.members.all(community)` key, so an exact-match lookup against
 * that key alone never finds it.
 */
export interface MemberCacheClient {
  getQueriesData(filters: { queryKey: readonly unknown[] }): [readonly unknown[], unknown][]
  setQueriesData(
    filters: { queryKey: readonly unknown[] },
    updater: (current: unknown) => unknown,
  ): unknown
  invalidateQueries(filters: { queryKey: readonly unknown[] }): unknown
}

/**
 * Surgically reconcile every cached member-list entry after a successful
 * role mutation instead of refetching `/v1/members` (issue #146, extended
 * for #243). Patches every query cached under the `queryKeys.members.all(community)`
 * prefix — the plain-array shape and the paginated `useInfiniteQuery` shape
 * alike — using the same pure reducers as the optimistic update.
 *
 * Falls back to a full `invalidateQueries` only when the target address
 * isn't found in any matching cache entry. That happens when a role is
 * assigned to an address that was never loaded into any cached list (e.g.
 * typed directly into the "Assign Role" form) — the optimistic update had
 * to fabricate a placeholder row (`tier: 'free', active: true`; see
 * `applyOptimisticRole`) there. Patching that placeholder again on success
 * would just re-derive the same fabricated data forever; only a real fetch
 * picks up the member's actual tier/active state. Deliberately not a silent
 * no-op in the missing/malformed-cache case either.
 *
 * `community` is optional and threads through to `queryKeys.members.all()`,
 * which itself only includes the community segment in the key when
 * `features.multiCommunity` is on — so this stays backward-compatible with
 * the single-community cache shape when that flag is off (the default).
 */
export function reconcileMemberRoleCache(
  client: MemberCacheClient,
  input: { address: string; role: Role; action: MemberRoleAction },
  community?: string,
): MemberCacheReconcileResult {
  const prefix = queryKeys.members.all(community)
  const entries = client.getQueriesData({ queryKey: prefix })
  const foundExisting = entries.some(([, data]) => entryHasAddress(data, input.address))

  if (!foundExisting) {
    void client.invalidateQueries({ queryKey: prefix })
    return 'invalidated'
  }

  client.setQueriesData({ queryKey: prefix }, (current) =>
    patchEntryData(current, input.address, input.role, input.action),
  )
  return 'patched'
}
