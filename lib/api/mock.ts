/**
 * lib/api/mock.ts
 *
 * In-memory mock API for local development and testing.
 * All existing member/resource/policy data and mutation logic is preserved.
 *
 * SIWE additions:
 *  - getNonce()    — returns a random hex string (no real cryptography needed)
 *  - siweVerify()  — immediately returns a mock SiweAuthSession with a 1-hour
 *                    expiry WITHOUT verifying the signature. This lets developers
 *                    work in mock mode without MetaMask.
 *  - siweLogout()  — no-op that resolves immediately.
 *
 * The mock MOCK_ADMIN_ADDRESS constant seeds a pre-authenticated admin for
 * convenience so you can simulate both unauthenticated and admin states:
 *   NEXT_PUBLIC_MOCK_ADMIN_ADDRESS=0xYourAddress
 */

import {
  AccessApi,
  AccessPolicy,
  Community,
  MemberProfile,
  MemberRow,
  Membership,
  Resource,
  Role,
  Session,
  SiweAuthSession,
} from './types'

const community: Community = {
  id: 'guildpass-demo',
  name: 'GuildPass Demo Community',
  description: 'Demo space for membership and gating',
  tiers: ['free', 'standard', 'pro'],
}

let resources: Resource[] = [
  { id: 'alpha', title: 'Alpha Docs', description: 'Internal docs', minTier: 'standard' },
  { id: 'pro-reports', title: 'Pro Reports', description: 'Advanced insight', minTier: 'pro' },
  { id: 'mem-updates', title: 'Member Updates', description: 'Community updates', minTier: 'free' },
]

let policies: AccessPolicy[] = [
  { resourceId: 'alpha', minTier: 'standard' },
  { resourceId: 'pro-reports', minTier: 'pro' },
  { resourceId: 'mem-updates', minTier: 'free' },
]

const memberStore: Record<string, { membership: Membership; roles: Role[]; profile: MemberProfile }> = {}

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
        badges: [],
      },
    }
  }
  return memberStore[addr]
}

/** Generate a short random hex nonce (16 bytes). */
function randomHex(): string {
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0'),
  ).join('')
}

export class MockAccessApi implements AccessApi {
  constructor(private readonly address?: string) {}

  // ── Read-only ──────────────────────────────────────────────────────────────

  async getSession(): Promise<Session> {
    const data = ensureAddress(this.address)
    return {
      address: this.address,
      roles: data ? data.roles : [],
      membership: data ? data.membership : undefined,
      community,
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

  async listMembers(): Promise<MemberRow[]> {
    return Object.values(memberStore).map((m) => ({
      address: m.membership.address,
      roles: m.roles,
      tier: m.membership.tier,
      active: m.membership.active,
    }))
  }

  async listResources(): Promise<Resource[]> {
    return resources
  }

  async listPolicies(): Promise<AccessPolicy[]> {
    return policies
  }

  // ── Mutations (token is accepted but not validated in mock mode) ───────────

  async assignRole(address: string, role: Role): Promise<void> {
    const data = ensureAddress(address)
    if (!data) return
    if (!data.roles.includes(role)) data.roles.push(role)
  }

  async updatePolicy(policy: AccessPolicy): Promise<void> {
    const idx = policies.findIndex((p) => p.resourceId === policy.resourceId)
    if (idx >= 0) policies[idx] = policy
    else policies.push(policy)
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
   * Returns a session token that expires in 1 hour. The token string is
   * deliberately fake ("mock-jwt-…") so it cannot be confused with a real token.
   */
  async siweVerify(_message: string, _signature: string): Promise<SiweAuthSession> {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    return {
      isAuthenticated: true,
      token: `mock-jwt-${randomHex()}`,
      address: this.address ?? '0x0000000000000000000000000000000000000000',
      expiresAt,
    }
  }

  /** No-op logout — the sessionStorage entry is cleared by the provider. */
  async siweLogout(_token: string): Promise<void> {
    // No server-side session to invalidate in mock mode
  }
}
