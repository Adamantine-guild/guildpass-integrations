/**
 * lib/api/mock.ts
 *
 * In-memory mock API for local development and testing.
 * All existing member/resource/policy data and mutation logic is preserved.
 *
 * SIWE additions:
 * - getNonce()    — returns a random hex string (no real cryptography needed)
 * - siweVerify()  — immediately returns a mock SiweAuthSession with a 1-hour
 * expiry WITHOUT verifying the signature. This lets developers
 * work in mock mode without MetaMask.
 * - siweLogout()  — no-op that resolves immediately.
 *
 * Session simulation:
 *  Set NEXT_PUBLIC_MOCK_SESSION_STATE to control the simulated auth boundary:
 *    "expired"         — siweVerify returns an already-expired token; admin
 *                        mutations (assignRole/updatePolicy) throw a 401 ApiError
 *    "unauthenticated" — siweVerify always throws, simulating a backend rejection
 *    (default)         — normal mock behaviour (instant auth, 1-hour token)
 *
 * The mock MOCK_ADMIN_ADDRESS constant seeds a pre-authenticated admin for
 * convenience so you can simulate both unauthenticated and admin states:
 * NEXT_PUBLIC_MOCK_ADMIN_ADDRESS=0xYourAddress
 *
 * Scenario presets and reset functionality for developer testing are also included.
 */
import { PolicyValidationError, validatePolicy } from '../validation/policy'
import {
  AccessApi,
  AccessPolicy,
  AnalyticsSummary,
  Community,
  MemberProfile,
  MemberRow,
  Membership,
  MembershipTier,
  PaginatedMembers,
  Resource,
  Role,
  Session,
  SiweAuthSession,
  WalletVerification,
  WebhookEventLog,
} from './types'
import { ApiError } from './errors'

/** Read once at module load so it is stable across renders. */
const MOCK_SESSION_STATE =
  (typeof process !== 'undefined' &&
    process.env.NEXT_PUBLIC_MOCK_SESSION_STATE) ||
  ''

const DEFAULT_COMMUNITY: Community = {
  id: 'guildpass-demo',
  name: 'GuildPass Demo Community',
  description: 'Demo space for membership and gating',
  tiers: ['free', 'standard', 'pro'],
}

const DEFAULT_RESOURCES: Resource[] = [
  {
    id: 'alpha',
    title: 'Alpha Docs',
    description: 'Internal docs',
    minTier: 'standard',
    content: [
      { type: 'text', body: 'Welcome to the Alpha Docs. This is a restricted area.' },
      { type: 'callout', title: 'Confidential', body: 'Do not share these documents outside the organization.', level: 'warning' },
      { type: 'markdown', body: '### Getting Started\n\n1. Clone the repo\n2. Run `npm install`' },
      { type: 'link', title: 'Internal Wiki', url: 'https://wiki.internal' }
    ]
  },
  {
    id: 'pro-reports',
    title: 'Pro Reports',
    description: 'Advanced insight',
    minTier: 'pro',
    content: [
      { type: 'text', body: 'Quarterly Analysis Report' },
      { type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Market Overview' },
      { type: 'file', title: 'Q3_Data.csv', url: '/files/q3_data.csv' }
    ]
  },
  { id: 'mem-updates', title: 'Member Updates', description: 'Community updates', minTier: 'free' },
]

const DEFAULT_POLICIES: AccessPolicy[] = [
  { resourceId: 'alpha', minTier: 'standard' },
  { resourceId: 'pro-reports', minTier: 'pro' },
  { resourceId: 'mem-updates', minTier: 'free' },
  // Composable-rule demos. Legacy minTier/roles fields are kept as the closest
  // single-condition approximation for older clients; `rule` is authoritative.
  {
    // Moderator Lounge: standard tier AND the moderator role.
    resourceId: 'mod-lounge',
    minTier: 'standard',
    roles: ['moderator'],
    rule: {
      type: 'and',
      rules: [
        { type: 'tier', minTier: 'standard' },
        { type: 'role', role: 'moderator' },
      ],
    },
  },
  {
    // Insider Hub: pro tier OR the "Early Member" badge.
    resourceId: 'insider-hub',
    minTier: 'pro',
    rule: {
      type: 'or',
      rules: [
        { type: 'tier', minTier: 'pro' },
        { type: 'badge', badge: 'Early Member' },
      ],
    },
  },
]

const DEFAULT_WEBHOOK_EVENTS: WebhookEventLog[] = [
  {
    id: "wh_01J1",
    eventType: "membership.created",
    status: "success",
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    affectedIdentifier: "0x71C...3A90",
    payloadSummary: { network: "ethereum", txHash: "0xabc...123", tier: "pro" },
    fullPayload: {
      event: "membership.created",
      data: {
        address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976A",
        tier: "pro",
        timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      },
      metadata: {
        network: "ethereum",
        txHash: "0xabc123def456abc123def456abc123def456abc123def456abc123def456abc123",
        blockNumber: 19548291,
      },
    },
  },
  {
    id: "wh_01J2",
    eventType: "membership.expired",
    status: "success",
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    affectedIdentifier: "0x94F...8B21",
    payloadSummary: { reason: "Subscription term elapsed" },
    fullPayload: {
      event: "membership.expired",
      data: {
        address: "0x94F68E164F64B8A2E2B9E7B1A3Ec5E7E3d8eB2A1",
        tier: "standard",
        expiresAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      },
      metadata: {
        reason: "Subscription term elapsed",
        gracePeriodDays: 7,
      },
    },
  },
  {
    id: "wh_01J3",
    eventType: "tier.upgraded",
    status: "failed",
    timestamp: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    affectedIdentifier: "0xF39...2441",
    payloadSummary: { network: "ethereum", reason: "Gas limit hit execution revert" },
    fullPayload: {
      event: "tier.upgraded",
      data: {
        address: "0xF39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        fromTier: "free",
        toTier: "standard",
      },
      metadata: {
        network: "ethereum",
        txHash: "0xdef789abc456def789abc456def789abc456def789abc456def789abc456def789",
        error: "Gas limit hit execution revert",
        gasUsed: "850000",
        gasLimit: "800000",
      },
    },
  },
]

/**
 * Generates a seeded member growth time series for the last 30 days.
 * Starts at 80 members and grows by 1–4 per day with a mild upward trend.
 */
function generateMockMemberGrowth(): AnalyticsSummary['memberGrowth'] {
  const days = 30
  const points: AnalyticsSummary['memberGrowth'] = []
  let total = 80

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    // Weekday gets more sign-ups; weekend less
    const dayOfWeek = d.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const newMembers = isWeekend
      ? Math.floor(Math.random() * 2)           // 0–1 on weekends
      : Math.floor(Math.random() * 4) + 1       // 1–4 on weekdays
    total += newMembers
    points.push({ date: dateStr, newMembers, totalMembers: total })
  }

  return points
}

const MOCK_ANALYTICS_SUMMARY: AnalyticsSummary = {
  totalMembers: 124,
  activeMembers: 98,
  memberGrowth: generateMockMemberGrowth(),
  resourceAccess: [
    { resourceId: 'alpha',       resourceTitle: 'Alpha Docs',     accessCount: 312, deniedCount: 47  },
    { resourceId: 'pro-reports', resourceTitle: 'Pro Reports',    accessCount: 189, deniedCount: 103 },
    { resourceId: 'mem-updates', resourceTitle: 'Member Updates', accessCount: 541, deniedCount: 12  },
  ],
  generatedAt: new Date().toISOString(),
}

const DEFAULT_MEMBER_STORE: Record<string, { membership: Membership; roles: Role[]; profile: MemberProfile }> = {}

// Populate 50,000 synthetic members to exercise the scale scenario
for (let i = 0; i < 50000; i++) {
  const hex = (i + 1).toString(16).padStart(40, '0')
  const address = `0x${hex}`
  const tier: MembershipTier = i % 10 < 3 ? 'pro' : i % 10 < 7 ? 'standard' : 'free'
  const active = i % 5 !== 0
  const roles: Role[] = i === 0 ? ['admin'] : i % 50 === 0 ? ['moderator'] : ['member']
  
  DEFAULT_MEMBER_STORE[address] = {
    membership: {
      address,
      tier,
      active,
    },
    roles,
    profile: {
      address,
      displayName: `Synthetic Member ${i + 1}`,
      badges: i % 100 === 0 ? ['Early Adopter'] : [],
    },
  }
}

let community: Community = { ...DEFAULT_COMMUNITY }
let resources: Resource[] = [...DEFAULT_RESOURCES]
let policies: AccessPolicy[] = [...DEFAULT_POLICIES]
let mockWebhookEvents: WebhookEventLog[] = [...DEFAULT_WEBHOOK_EVENTS]
let memberStore: Record<string, { membership: Membership; roles: Role[]; profile: MemberProfile }> = { ...DEFAULT_MEMBER_STORE }

function ensureAddress(addr?: string) {
  if (!addr) return null
  if (!memberStore[addr]) {
    memberStore[addr] = {
      membership: {
        address: addr,
        tier: 'free',
        active: true,
      },
      roles: ['member'],
      profile: {
        address: addr,
        displayName: `User ${addr.slice(0, 6)}`,
        badges: ['Early Member', 'Beta Tester'],
      },
    }
  }
  return memberStore[addr]
}

type MockScenario = 
  | 'active-member' 
  | 'expired-member' 
  | 'denied-resource' 
  | 'admin-session-expired' 
  | 'no-roles'

/**
 * Replay a webhook event by cloning it into the mock event store.
 * The clone is marked with `isReplay: true` and inserted at the top
 * of the feed with a `pending` status so it is visually distinct.
 *
 * This function operates directly on the module-level mock store and
 * is intended for use by the admin event replay tool. It must only be
 * called when `config.apiMode === 'mock'`.
 */
export function replayMockEvent(eventId: string): WebhookEventLog {
  const original = mockWebhookEvents.find((e) => e.id === eventId)
  if (!original) {
    throw new ApiError({
      status: 404,
      code: 'not_found',
      safeMessage: `Event "${eventId}" not found in mock store.`,
    })
  }

  const replay: WebhookEventLog = {
    ...original,
    id: `replay_${eventId}_${Date.now()}`,
    timestamp: new Date().toISOString(),
    isReplay: true,
    status: 'pending',
    fullPayload: original.fullPayload ?? { ...original.payloadSummary },
  }

  mockWebhookEvents.unshift(replay)
  return replay
}

/**
 * Reset all mock data to its initial state.
 */
export function resetMockData() {
  community = { ...DEFAULT_COMMUNITY }
  resources = [...DEFAULT_RESOURCES]
  policies = [...DEFAULT_POLICIES]
  mockWebhookEvents = [...DEFAULT_WEBHOOK_EVENTS]
  memberStore = { ...DEFAULT_MEMBER_STORE }
}

/**
 * Apply a predefined scenario preset for testing.
 */
export function applyMockScenario(scenario: MockScenario, address: string = '0x1234567890123456789012345678901234567890') {
  resetMockData()
  
  switch (scenario) {
    case 'active-member':
      memberStore[address] = {
        membership: {
          address,
          tier: 'standard',
          active: true,
        },
        roles: ['member'],
        profile: {
          address,
          displayName: 'Active Standard User',
          badges: ['Early Member', 'Standard Tier'],
        },
      }
      break
      
    case 'expired-member':
      memberStore[address] = {
        membership: {
          address,
          tier: 'standard',
          active: false,
          expiresAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        },
        roles: ['member'],
        profile: {
          address,
          displayName: 'Expired User',
          badges: ['Former Member'],
        },
      }
      break
      
    case 'denied-resource':
      memberStore[address] = {
        membership: {
          address,
          tier: 'free',
          active: true,
        },
        roles: ['member'],
        profile: {
          address,
          displayName: 'Free Tier User',
          badges: ['Free Tier'],
        },
      }
      // Ensure Alpha Docs require standard tier
      policies = policies.map(p => 
        p.resourceId === 'alpha' 
          ? { ...p, minTier: 'standard' } 
          : p
      )
      break
      
    case 'admin-session-expired':
      memberStore[address] = {
        membership: {
          address,
          tier: 'pro',
          active: true,
        },
        roles: ['admin', 'member'],
        profile: {
          address,
          displayName: 'Expired Admin',
          badges: ['Admin', 'Pro Tier'],
        },
      }
      break
      
    case 'no-roles':
      memberStore[address] = {
        membership: {
          address,
          tier: 'free',
          active: true,
        },
        roles: [],
        profile: {
          address,
          displayName: 'No Roles User',
          badges: ['New User'],
        },
      }
      break
  }
}

/** Generate a short random hex nonce (16 bytes). */
function randomHex(): string {
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0'),
  ).join('')
}

/** Throw a mock 401 ApiError — mirrors what the live API throws on expired tokens. */
function throwMockUnauthorized(): never {
  throw new ApiError({
    status: 401,
    code: 'unauthorized',
    safeMessage: 'Session expired. Please sign in again.',
  })
}

export class MockAccessApi implements AccessApi {
  constructor(private readonly address?: string) { }

  // ── Read-only ──────────────────────────────────────────────────────────────

  async getSession(): Promise<Session> {
    const MOCK_SESSION_STATE = process.env.NEXT_PUBLIC_MOCK_SESSION_STATE || 'valid'
    if (MOCK_SESSION_STATE === 'cleared') {
      return {
        // No authenticated session
        roles: [],
        community,
      }
    }

    const data = ensureAddress(this.address)
    return {
      address: this.address,
      roles: data ? data.roles : [],
      membership: data ? data.membership : undefined,
      community,
      ...(data ? { badges: data.profile.badges } : {}),
    }
  }

  async getCommunity(): Promise<Community> {
    return community
  }

  async getMembership(address: string): Promise<Membership | null> {
    const data = ensureAddress(address)
    return data?.membership ?? null
  }

  async getProfile(address: string): Promise<MemberProfile | null> {
    const data = ensureAddress(address)
    return data?.profile ?? null
  }

  async listMembers(params?: { cursor?: string; limit?: number; filter?: string }): Promise<MemberRow[] | PaginatedMembers> {
    let list = Object.values(memberStore).map((m) => ({
      address: m.membership.address,
      roles: m.roles,
      tier: m.membership.tier,
      active: m.membership.active,
    }))

    if (!params) {
      return list
    }

    if (params.filter) {
      const f = params.filter.toLowerCase()
      list = list.filter((m) => m.address.toLowerCase().includes(f))
    }

    const limit = params.limit ?? 100
    const cursor = params.cursor ? parseInt(params.cursor, 10) : 0

    const paginated = list.slice(cursor, cursor + limit)
    const nextCursor = cursor + limit < list.length ? String(cursor + limit) : undefined

    return {
      members: paginated,
      nextCursor,
    }
  }

  async listResources(): Promise<Resource[]> {
    return resources.map((r) => ({ ...r, roles: r.roles ?? [] }))
  }

  async listPolicies(): Promise<AccessPolicy[]> {
    return policies.map((p) => ({ ...p, roles: p.roles ?? [] }))
  }

  async getResource(id: string): Promise<Resource | null> {
    const r = resources.find((x) => x.id === id)
    return r ? { ...r, roles: r.roles ?? [] } : null
  }

  async getPolicy(resourceId: string): Promise<AccessPolicy | null> {
    const p = policies.find((x) => x.resourceId === resourceId)
    return p ? { ...p, roles: p.roles ?? [] } : null
  }

  // ── Admin queries & mutations ──────────────────────────────────────────────

  async listWebhookEvents(): Promise<WebhookEventLog[]> {
    return new Promise((resolve) => setTimeout(() => resolve(mockWebhookEvents), 300))
  }

  /**
   * Replay a webhook event by cloning it and adding the clone to the mock
   * event store. The clone is clearly marked as a replayed entry so the UI
   * can distinguish it from original events.
   *
   * This method is intentionally only available on MockAccessApi — it is
   * NOT part of the AccessApi interface and must never be called in live mode.
   */
  async replayEvent(eventId: string): Promise<WebhookEventLog> {
    const original = mockWebhookEvents.find((e) => e.id === eventId)
    if (!original) {
      throw new ApiError({
        status: 404,
        code: 'not_found',
        safeMessage: `Event "${eventId}" not found in mock store.`,
      })
    }

    const replay: WebhookEventLog = {
      ...original,
      id: `replay_${eventId}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      isReplay: true,
      status: 'pending',
      fullPayload: original.fullPayload ?? { ...original.payloadSummary },
    }

    // Insert at the beginning so it appears at the top of the feed
    mockWebhookEvents.unshift(replay)
    return replay
  }

  async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    // Simulate a short network delay so the loading state is exercisable
    return new Promise((resolve) =>
      setTimeout(() => resolve({ ...MOCK_ANALYTICS_SUMMARY }), 300),
    )
  }

  async assignRole(address: string, role: Role): Promise<void> {
    if (MOCK_SESSION_STATE === 'expired') throwMockUnauthorized()
    const data = ensureAddress(address)
    if (!data) return
    if (!data.roles.includes(role)) data.roles.push(role)
  }

  async removeRole(address: string, role: Role): Promise<void> {
    if (MOCK_SESSION_STATE === 'expired') throwMockUnauthorized()
    const data = memberStore[address]
    if (!data) return
    data.roles = data.roles.filter((r) => r !== role)
  }

  async updatePolicy(policy: AccessPolicy): Promise<void> {
    if (MOCK_SESSION_STATE === 'expired') throwMockUnauthorized()
    const result = validatePolicy(policy)

    if (!result.valid) {
      throw new PolicyValidationError(result.errors)
    }

    const idx = policies.findIndex((p) => p.resourceId === result.value.resourceId)
    if (idx >= 0) policies[idx] = result.value
    else policies.push(result.value)
  }

  // ── SIWE mock endpoints ────────────────────────────────────────────────────

  /**
   * Returns a random nonce. In a real backend this would be a single-use value
   * stored server-side to prevent replay attacks.
   */
  async getNonce(_address: string): Promise<string> {
    return randomHex()
  }

  /**
   * Mock SIWE verification — skips actual signature checking.
   *
   * - Default:          Returns a session token expiring in 1 hour, plus a
   *                     refresh token expiring in 7 days.
   * - expired mode:     Returns an already-expired access token (1 ms in the
   *                     past) with a valid refresh token so that the silent
   *                     renewal path can be exercised in tests.
   * - unauthenticated:  Throws a 401 ApiError to simulate backend rejection.
   */
  async siweVerify(_message: string, _signature: string): Promise<SiweAuthSession> {
    if (MOCK_SESSION_STATE === 'unauthenticated') {
      throwMockUnauthorized()
    }

    const expiresAt =
      MOCK_SESSION_STATE === 'expired'
        ? new Date(Date.now() - 1).toISOString()   // already expired
        : new Date(Date.now() + 60 * 60 * 1000).toISOString()

    // Refresh token is always valid for 7 days in mock mode so the renewal
    // path can be tested even when the access token is intentionally expired.
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    return {
      isAuthenticated: true,
      token: `mock-jwt-${randomHex()}`,
      address: this.address ?? '0x0000000000000000000000000000000000000000',
      expiresAt,
      refreshToken: `mock-refresh-${randomHex()}`,
      refreshExpiresAt,
    }
  }

  /**
   * Mock silent token renewal via refresh token.
   *
   * Validates that the provided refresh token looks like a mock refresh token
   * (prefix check only — no cryptography in mock mode).  Returns a fresh
   * access token expiring 1 hour from now and a rotated refresh token.
   *
   * Throws a 401 if the token is missing or malformed to demonstrate the
   * "refresh failed → sign-out" flow in tests.
   *
   * Set NEXT_PUBLIC_MOCK_SESSION_STATE=expired to force siweRefresh to also
   * fail (simulates a fully-expired or revoked refresh token).
   */
  async siweRefresh(refreshToken: string): Promise<SiweAuthSession> {
    if (MOCK_SESSION_STATE === 'expired' || MOCK_SESSION_STATE === 'unauthenticated') {
      throw new ApiError({
        status: 401,
        code: 'unauthorized',
        safeMessage: 'Refresh token expired. Please sign in again.',
      })
    }

    if (!refreshToken || !refreshToken.startsWith('mock-refresh-')) {
      throw new ApiError({
        status: 401,
        code: 'unauthorized',
        safeMessage: 'Invalid refresh token.',
      })
    }

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    return {
      isAuthenticated: true,
      // Issue a fresh access token and rotate the refresh token
      token: `mock-jwt-${randomHex()}`,
      address: this.address ?? '0x0000000000000000000000000000000000000000',
      expiresAt,
      refreshToken: `mock-refresh-${randomHex()}`,
      refreshExpiresAt,
    }
  }

  /** No-op logout — the sessionStorage entry is cleared by the provider. */
  async siweLogout(_token: string): Promise<void> {
    // No server-side session to invalidate in mock mode
  }

  async verifyWallet(address: string): Promise<WalletVerification> {
    return {
      verified: true,
      method: 'mock',
      checkedAt: new Date().toISOString(),
    }
  }
}
