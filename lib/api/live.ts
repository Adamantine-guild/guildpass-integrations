/**
 * lib/api/live.ts
 *
 * Live integration with guildpass-core access-api.
 *
 * Routes: all endpoints now target the current guildpass-core /v1/* structure.
 * A lightweight response-mapping layer converts backend shapes into the
 * frontend AccessApi interface so the rest of the app stays decoupled from
 * backend internals.
 *
 * SIWE:
 *  - Constructor accepts an optional `token` (Bearer token from SIWE verify).
 *  - Read-only methods remain unauthenticated (no header needed).
 *  - Mutation methods (assignRole, updatePolicy) send `Authorization: Bearer <token>`.
 *  - Throws `AuthError` (HTTP 401) so callers can detect an expired session and
 *    prompt the user to re-authenticate.
 *  - getNonce / siweVerify / siweLogout hit the SIWE endpoints on the backend.
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
  WebhookEvent,
  Paginated,
  AdminEventFilterParams,
  // Raw backend shapes used for response mapping
  BackendSession,
  BackendMember,
  BackendResource,
  BackendPolicy,
} from './types'

const BASE = process.env.NEXT_PUBLIC_CORE_API_URL || 'http://localhost:4000'

/** Thrown when the backend returns HTTP 401 (expired / invalid session token). */
export class AuthError extends Error {
  constructor() {
    super('Session expired. Please sign in again.')
    this.name = 'AuthError'
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    statusText: string,
    serverMessage?: string
  ) {
    super(serverMessage ? `${serverMessage} (${status})` : `Request failed (${status} ${statusText})`)
    this.name = 'ApiError'
  }
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (res.status === 401) {
    throw new AuthError()
  }
  if (!res.ok) {
    let serverMessage: string | undefined
    try {
      const body = await res.json()
      const raw = body?.message ?? body?.error
      if (typeof raw === 'string' && raw.length <= 120 && !raw.includes('<')) {
        serverMessage = raw
      }
    } catch {}
    throw new ApiError(res.status, res.statusText, serverMessage)
  }
  return res.json() as Promise<T>
}

// ── Response mappers ──────────────────────────────────────────────────────────
// These convert backend shapes into the frontend types defined in types.ts.
// If the backend ever aligns its field names with the frontend types, the
// mapper becomes a no-op and can be removed without touching call sites.

function mapCommunity(raw: BackendSession['community']): Community {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    tiers: raw.tiers ?? ['free', 'standard', 'pro'],
  }
}

function mapMembership(raw: BackendMember): Membership {
  return {
    address: raw.address ?? raw.wallet_address,
    tier: raw.tier ?? raw.membership_tier ?? 'free',
    active: raw.active ?? raw.is_active ?? false,
    expiresAt: raw.expiresAt ?? raw.expires_at,
  }
}

function mapMemberProfile(raw: BackendMember, address: string): MemberProfile {
  return {
    address,
    displayName: raw.displayName ?? raw.display_name ?? raw.username,
    bio: raw.bio,
    badges: raw.badges ?? [],
  }
}

function mapMemberRow(raw: BackendMember): MemberRow {
  return {
    address: raw.address ?? raw.wallet_address,
    roles: raw.roles ?? [],
    tier: raw.tier ?? raw.membership_tier ?? 'free',
    active: raw.active ?? raw.is_active ?? false,
  }
}

function mapResource(raw: BackendResource): Resource {
  return {
    id: raw.id,
    title: raw.title ?? raw.name,
    description: raw.description,
    minTier: raw.minTier ?? raw.min_tier,
    roles: raw.roles,
  }
}

function mapPolicy(raw: BackendPolicy): AccessPolicy {
  return {
    resourceId: raw.resourceId ?? raw.resource_id,
    minTier: raw.minTier ?? raw.min_tier,
    roles: raw.roles,
  }
}

function mapSession(raw: BackendSession): Session {
  return {
    address: raw.address ?? raw.wallet_address,
    roles: raw.roles ?? [],
    membership: raw.membership ? mapMembership(raw.membership as BackendMember) : undefined,
    community: raw.community ? mapCommunity(raw.community) : undefined,
  }
}

// ── LiveAccessApi ─────────────────────────────────────────────────────────────

export class LiveAccessApi implements AccessApi {
  /**
   * @param address  Connected wallet address (used for read-only session queries)
   * @param token    SIWE session token — required for admin mutations
   */
  constructor(
    private readonly address?: string,
    private readonly token?: string,
  ) {}

  /** Returns headers including the Bearer token when one is available. */
  private authHeaders(): HeadersInit {
    if (!this.token) return {}
    return { Authorization: `Bearer ${this.token}` }
  }

  // ── Read-only ──────────────────────────────────────────────────────────────

  async getSession(): Promise<Session> {
    const addr = this.address ? `?address=${encodeURIComponent(this.address)}` : ''
    const raw = await getJson<BackendSession>(`/v1/session${addr}`)
    return mapSession(raw)
  }

  async getCommunity(): Promise<Community> {
    const raw = await getJson<BackendSession['community']>('/v1/community')
    return mapCommunity(raw)
  }

  async getMembership(address: string): Promise<Membership | null> {
    const raw = await getJson<BackendMember | null>(
      `/v1/members/${encodeURIComponent(address)}/membership`,
    )
    return raw ? mapMembership(raw) : null
  }

  async getProfile(address: string): Promise<MemberProfile | null> {
    const raw = await getJson<BackendMember | null>(
      `/v1/members/${encodeURIComponent(address)}/profile`,
    )
    return raw ? mapMemberProfile(raw, address) : null
  }

  async listMembers(): Promise<MemberRow[]> {
    const raw = await getJson<BackendMember[]>('/v1/members')
    return raw.map(mapMemberRow)
  }

  async listResources(): Promise<Resource[]> {
    const raw = await getJson<BackendResource[]>('/v1/resources')
    return raw.map(mapResource)
  }

  async listPolicies(): Promise<AccessPolicy[]> {
    const raw = await getJson<BackendPolicy[]>('/v1/policies')
    return raw.map(mapPolicy)
  }

  // ── Authenticated mutations ────────────────────────────────────────────────

  async assignRole(address: string, role: Role): Promise<void> {
    await getJson<void>(`/v1/members/${encodeURIComponent(address)}/roles`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ role }),
    })
  }

  async updatePolicy(policy: AccessPolicy): Promise<void> {
    await getJson<void>(`/v1/policies/${encodeURIComponent(policy.resourceId)}`, {
      method: 'PUT',
      headers: this.authHeaders(),
      body: JSON.stringify({
        resource_id: policy.resourceId,
        min_tier: policy.minTier,
        roles: policy.roles,
      }),
    })
  }

  async listAdminEvents(params?: AdminEventFilterParams): Promise<Paginated<WebhookEvent>> {
    const searchParams = new URLSearchParams()
    if (params?.types) {
      params.types.forEach((t) => searchParams.append('types', t))
    }
    if (params?.startDate) searchParams.append('startDate', params.startDate)
    if (params?.endDate) searchParams.append('endDate', params.endDate)
    if (params?.page) searchParams.append('page', params.page.toString())
    if (params?.limit) searchParams.append('limit', params.limit.toString())

    const qs = searchParams.toString()
    const query = qs ? `?${qs}` : ''

    return getJson<Paginated<WebhookEvent>>(`/v1/admin/events${query}`, {
      headers: this.authHeaders(),
    })
  }

  // ── SIWE authentication ────────────────────────────────────────────────────

  /**
   * Fetch a one-time nonce for the address.
   * Backend endpoint: POST /v1/auth/siwe/nonce  { address }
   */
  async getNonce(address: string): Promise<string> {
    const data = await getJson<{ nonce: string }>('/v1/auth/siwe/nonce', {
      method: 'POST',
      body: JSON.stringify({ address }),
    })
    return data.nonce
  }

  /**
   * Submit the signed EIP-4361 message to the backend for verification.
   * Backend endpoint: POST /v1/auth/siwe/verify  { message, signature }
   * Response: { token, address, expiresAt }
   */
  async siweVerify(message: string, signature: string): Promise<SiweAuthSession> {
    const data = await getJson<{ token: string; address: string; expiresAt: string }>(
      '/v1/auth/siwe/verify',
      {
        method: 'POST',
        body: JSON.stringify({ message, signature }),
      },
    )
    return { isAuthenticated: true, ...data }
  }

  /**
   * Invalidate the session on the backend.
   * Backend endpoint: POST /v1/auth/siwe/logout
   */
  async siweLogout(token: string): Promise<void> {
    await getJson<void>('/v1/auth/siwe/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {
      // Best-effort: don't block client-side logout if the server call fails
    })
  }
}
