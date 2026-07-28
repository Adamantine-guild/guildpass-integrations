import test from 'node:test'
import assert from 'node:assert/strict'
import { computeAnalyticsSummary, fetchAllMembers } from '../lib/api/analytics'
import type { MemberRow, PaginatedMembers, WebhookEventLog } from '../lib/api/types'

function member(overrides: Partial<MemberRow>): MemberRow {
  return { address: '0x0', roles: [], tier: 'free', active: true, ...overrides }
}

function event(overrides: Partial<WebhookEventLog>): WebhookEventLog {
  return {
    id: 'evt',
    eventType: 'membership.created',
    status: 'success',
    timestamp: '2026-01-01T00:00:00.000Z',
    affectedIdentifier: '0x0',
    payloadSummary: {},
    ...overrides,
  }
}

test('returns zeroed-out distributions (not empty arrays) for no members or events', () => {
  const result = computeAnalyticsSummary([], [])

  assert.equal(result.totalMembers, 0)
  assert.equal(result.activeMembers, 0)
  assert.deepEqual(result.roleDistribution, [
    { role: 'member', count: 0 },
    { role: 'moderator', count: 0 },
    { role: 'admin', count: 0 },
  ])
  assert.deepEqual(result.tierDistribution, [
    { tier: 'free', count: 0 },
    { tier: 'standard', count: 0 },
    { tier: 'pro', count: 0 },
  ])
  assert.deepEqual(result.signupsOverTime, [])
  assert.equal(typeof result.generatedAt, 'string')
})

test('counts totalMembers and activeMembers', () => {
  const members = [
    member({ address: '0x1', active: true }),
    member({ address: '0x2', active: true }),
    member({ address: '0x3', active: false }),
  ]
  const result = computeAnalyticsSummary(members, [])
  assert.equal(result.totalMembers, 3)
  assert.equal(result.activeMembers, 2)
})

test('a member with multiple roles is counted once in each applicable bucket', () => {
  const members = [
    member({ address: '0x1', roles: ['member', 'moderator'] }),
    member({ address: '0x2', roles: ['member', 'admin'] }),
    member({ address: '0x3', roles: ['member'] }),
  ]
  const result = computeAnalyticsSummary(members, [])
  assert.deepEqual(result.roleDistribution, [
    { role: 'member', count: 3 },
    { role: 'moderator', count: 1 },
    { role: 'admin', count: 1 },
  ])
})

test('tier distribution is mutually exclusive and sums to totalMembers', () => {
  const members = [
    member({ address: '0x1', tier: 'free' }),
    member({ address: '0x2', tier: 'standard' }),
    member({ address: '0x3', tier: 'standard' }),
    member({ address: '0x4', tier: 'pro' }),
  ]
  const result = computeAnalyticsSummary(members, [])
  assert.deepEqual(result.tierDistribution, [
    { tier: 'free', count: 1 },
    { tier: 'standard', count: 2 },
    { tier: 'pro', count: 1 },
  ])
  const sum = result.tierDistribution.reduce((s, t) => s + t.count, 0)
  assert.equal(sum, result.totalMembers)
})

test('signupsOverTime only counts membership.created events, ignoring other event types', () => {
  const events = [
    event({ id: '1', eventType: 'membership.created', timestamp: '2026-01-01T00:00:00.000Z' }),
    event({ id: '2', eventType: 'membership.expired', timestamp: '2026-01-01T01:00:00.000Z' }),
    event({ id: '3', eventType: 'tier.upgraded', timestamp: '2026-01-01T02:00:00.000Z' }),
    event({ id: '4', eventType: 'policy.updated', timestamp: '2026-01-01T03:00:00.000Z' }),
  ]
  const result = computeAnalyticsSummary([], events)
  assert.deepEqual(result.signupsOverTime, [{ date: '2026-01-01', count: 1 }])
})

test('signupsOverTime buckets multiple same-day signups and sorts chronologically regardless of input order', () => {
  const events = [
    event({ id: '1', eventType: 'membership.created', timestamp: '2026-01-03T00:00:00.000Z' }),
    event({ id: '2', eventType: 'membership.created', timestamp: '2026-01-01T00:00:00.000Z' }),
    event({ id: '3', eventType: 'membership.created', timestamp: '2026-01-01T12:00:00.000Z' }),
    event({ id: '4', eventType: 'membership.created', timestamp: '2026-01-02T00:00:00.000Z' }),
  ]
  const result = computeAnalyticsSummary([], events)
  assert.deepEqual(result.signupsOverTime, [
    { date: '2026-01-01', count: 2 },
    { date: '2026-01-02', count: 1 },
    { date: '2026-01-03', count: 1 },
  ])
})

test('does not zero-fill dates with no signups — only real data points are included', () => {
  const events = [
    event({ id: '1', eventType: 'membership.created', timestamp: '2026-01-01T00:00:00.000Z' }),
    event({ id: '2', eventType: 'membership.created', timestamp: '2026-01-10T00:00:00.000Z' }),
  ]
  const result = computeAnalyticsSummary([], events)
  assert.equal(result.signupsOverTime.length, 2)
})

// ── fetchAllMembers ──────────────────────────────────────────────────────────

test('fetchAllMembers returns a flat array response as-is without further calls', async () => {
  let calls = 0
  const api = {
    listMembers: async (): Promise<MemberRow[]> => {
      calls += 1
      return [member({ address: '0x1' }), member({ address: '0x2' })]
    },
  }
  const result = await fetchAllMembers(api)
  assert.equal(result.length, 2)
  assert.equal(calls, 1)
})

test('fetchAllMembers follows nextCursor and concatenates every page', async () => {
  const pages: PaginatedMembers[] = [
    { members: [member({ address: '0x1' }), member({ address: '0x2' })], nextCursor: 'page-2' },
    { members: [member({ address: '0x3' })], nextCursor: 'page-3' },
    { members: [member({ address: '0x4' })], nextCursor: undefined },
  ]
  const seenCursors: (string | undefined)[] = []
  const api = {
    listMembers: async (params?: { cursor?: string }): Promise<PaginatedMembers> => {
      seenCursors.push(params?.cursor)
      const index = seenCursors.length - 1
      return pages[index]
    },
  }
  const result = await fetchAllMembers(api)
  assert.deepEqual(
    result.map((m) => m.address),
    ['0x1', '0x2', '0x3', '0x4'],
  )
  assert.deepEqual(seenCursors, [undefined, 'page-2', 'page-3'])
})

test('fetchAllMembers stops at the page safety cap instead of looping forever', async () => {
  let calls = 0
  const api = {
    listMembers: async (): Promise<PaginatedMembers> => {
      calls += 1
      // Always returns a nextCursor — simulates a backend bug or an
      // unbounded dataset. The loop must still terminate.
      return { members: [member({ address: `0x${calls}` })], nextCursor: `cursor-${calls}` }
    },
  }
  const result = await fetchAllMembers(api)
  assert.ok(calls <= 201, `expected the loop to be bounded, got ${calls} calls`)
  assert.equal(result.length, calls)
})
