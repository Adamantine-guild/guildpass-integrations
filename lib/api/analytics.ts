import type { MemberRow, MembershipTier, PaginatedMembers, Role, WebhookEventLog } from './types'

const ALL_ROLES: Role[] = ['member', 'moderator', 'admin']
const ALL_TIERS: MembershipTier[] = ['free', 'standard', 'pro']

/**
 * Members are fetched this many at a time when accumulating the full list
 * for analytics. Larger than the UI pagination page size (100, used by
 * /admin/members) to keep the number of round trips reasonable.
 */
const MEMBERS_PAGE_SIZE = 1000

/**
 * Safety cap on the number of pages followed. At MEMBERS_PAGE_SIZE this
 * covers 200,000 members — comfortably above the 50,000-member mock
 * dataset — while still bounding the loop against a backend that never
 * stops returning a nextCursor.
 */
const MAX_MEMBER_PAGES = 200

export interface RoleDistributionEntry {
  role: Role
  count: number
}

export interface TierDistributionEntry {
  tier: MembershipTier
  count: number
}

export interface SignupsDataPoint {
  /** ISO 8601 date (YYYY-MM-DD). */
  date: string
  count: number
}

/**
 * Analytics summary computed entirely client-side from data the app already
 * fetches elsewhere (`listMembers()` / `GET /v1/members` and
 * `listWebhookEvents()` / `GET /v1/admin/events`) — no dedicated analytics
 * backend endpoint required.
 *
 * This intentionally does NOT include a resource-access breakdown: the
 * webhook event log only carries membership-lifecycle and policy-update
 * events (see `WebhookEventType`), not resource-access attempts, so a
 * per-resource access/denial count cannot be honestly derived from real
 * data today. Signups-over-time is a proxy — one event log entry per
 * `membership.created` — rather than a guaranteed complete history.
 */
export interface ComputedAnalyticsSummary {
  totalMembers: number
  activeMembers: number
  /** One entry per role in a stable order, even when the count is 0. Roles are not mutually exclusive, so counts do not need to sum to totalMembers. */
  roleDistribution: RoleDistributionEntry[]
  /** One entry per tier in a stable order, even when the count is 0. Tiers are mutually exclusive, so counts sum to totalMembers. */
  tierDistribution: TierDistributionEntry[]
  /** Count of `membership.created` events per day, sorted chronologically. Only dates with at least one signup are included — no zero-filled range, since the underlying event log has no guaranteed retention window. */
  signupsOverTime: SignupsDataPoint[]
  /** ISO timestamp of when this summary was computed (not a backend response time — there is no backend round trip). */
  generatedAt: string
}

/**
 * Fetches the complete member list for analytics purposes, following
 * pagination if the backend returns `PaginatedMembers` rather than a flat
 * array. `listMembers()`'s contract permits either shape at any time — a
 * real guildpass-core deployment may paginate regardless of the requested
 * page size — so this always walks pages to completion (or the safety cap)
 * rather than assuming the first response is the whole list.
 */
export async function fetchAllMembers(
  api: { listMembers: (params?: { cursor?: string; limit?: number }, signal?: AbortSignal) => Promise<MemberRow[] | PaginatedMembers> },
  signal?: AbortSignal,
): Promise<MemberRow[]> {
  const all: MemberRow[] = []
  let cursor: string | undefined
  let pages = 0

  do {
    const result = await api.listMembers({ cursor, limit: MEMBERS_PAGE_SIZE }, signal)
    if (Array.isArray(result)) {
      all.push(...result)
      break
    }
    all.push(...result.members)
    cursor = result.nextCursor
    pages += 1
  } while (cursor && pages < MAX_MEMBER_PAGES)

  return all
}

export function computeAnalyticsSummary(
  members: MemberRow[],
  events: WebhookEventLog[],
): ComputedAnalyticsSummary {
  const roleDistribution: RoleDistributionEntry[] = ALL_ROLES.map((role) => ({
    role,
    count: members.filter((m) => m.roles.includes(role)).length,
  }))

  const tierDistribution: TierDistributionEntry[] = ALL_TIERS.map((tier) => ({
    tier,
    count: members.filter((m) => m.tier === tier).length,
  }))

  const signupsByDate = new Map<string, number>()
  for (const event of events) {
    if (event.eventType !== 'membership.created') continue
    const date = event.timestamp.slice(0, 10)
    signupsByDate.set(date, (signupsByDate.get(date) ?? 0) + 1)
  }
  const signupsOverTime: SignupsDataPoint[] = [...signupsByDate.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    totalMembers: members.length,
    activeMembers: members.filter((m) => m.active).length,
    roleDistribution,
    tierDistribution,
    signupsOverTime,
    generatedAt: new Date().toISOString(),
  }
}
