export type Role = 'member' | 'moderator' | 'admin'

export type MembershipTier = 'free' | 'standard' | 'pro'

export interface Community {
  id: string
  name: string
  description?: string
  tiers: MembershipTier[]
}

export interface Membership {
  address: string
  tier: MembershipTier
  active: boolean
  expiresAt?: string
}

export interface MemberProfile {
  address: string
  displayName?: string
  bio?: string
  badges: string[]
}

export interface Session {
  address?: string
  roles: Role[]
  membership?: Membership
  community?: Community
}

export interface Resource {
  id: string
  title: string
  description?: string
  minTier?: MembershipTier
  roles?: Role[]
}

export interface AccessPolicy {
  resourceId: string
  minTier?: MembershipTier
  roles?: Role[]
}

export interface MemberRow {
  address: string
  roles: Role[]
  tier: MembershipTier
  active: boolean
}

// ── SIWE Auth Types ───────────────────────────────────────────────────────────

/**
 * A fully authenticated SIWE session, returned by the backend after
 * successfully verifying a signed EIP-4361 message.
 */
export interface SiweAuthSession {
  isAuthenticated: true
  token: string
  address: string
  /** ISO-8601 expiry timestamp, e.g. "2026-06-16T21:00:00Z" */
  expiresAt: string
}

/**
 * Union of authenticated / unauthenticated states for the SIWE context.
 */
export type SiweAuthState =
  | SiweAuthSession
  | { isAuthenticated: false }

// ── API Interface ─────────────────────────────────────────────────────────────

export interface AccessApi {
  // ── Read-only (no auth token required) ──────────────────────────────────
  getSession(): Promise<Session>
  getCommunity(): Promise<Community>
  getMembership(address: string): Promise<Membership | null>
  getProfile(address: string): Promise<MemberProfile | null>
  listMembers(): Promise<MemberRow[]>
  listResources(): Promise<Resource[]>
  listPolicies(): Promise<AccessPolicy[]>

  // ── Admin mutations (require a valid SIWE token) ─────────────────────────
  assignRole(address: string, role: Role): Promise<void>
  updatePolicy(policy: AccessPolicy): Promise<void>

  // ── SIWE authentication endpoints ────────────────────────────────────────
  /** Fetch a one-time nonce for the given address to include in the SIWE message. */
  getNonce(address: string): Promise<string>
  /**
   * Submit a signed EIP-4361 message and receive an authenticated session
   * token. The backend verifies the signature and returns a short-lived token.
   */
  siweVerify(message: string, signature: string): Promise<SiweAuthSession>
  /** Invalidate the current server-side session (no-op for stateless JWTs). */
  siweLogout(token: string): Promise<void>
}
