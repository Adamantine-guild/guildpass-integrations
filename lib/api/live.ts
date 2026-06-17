/**
 * lib/api/live.ts
 *
 * Live integration with guildpass-core access-api.
 *
 * SIWE changes:
 *  - Constructor now accepts an optional `token` (Bearer token from SIWE verify).
 *  - Read-only methods remain unauthenticated (no header needed).
 *  - Mutation methods (assignRole, updatePolicy) send `Authorization: Bearer <token>`.
 *  - Throws `AuthError` (HTTP 401) so callers can detect an expired session and
 *    prompt the user to re-authenticate.
 *  - getNonce / siweVerify / siweLogout hit the new SIWE endpoints on the backend.
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

const BASE = process.env.NEXT_PUBLIC_CORE_API_URL || 'http://localhost:4000'

/** Thrown when the backend returns HTTP 401 (expired / invalid session token). */
export class AuthError extends Error {
  constructor() {
    super('Session expired. Please sign in again.')
    this.name = 'AuthError'
  }
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (res.status === 401) throw new AuthError()
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return res.json() as Promise<T>
}

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
    return getJson<Session>(`/access-api/session?address=${this.address ?? ''}`)
  }
  async getCommunity(): Promise<Community> {
    return getJson<Community>('/access-api/community')
  }
  async getMembership(address: string): Promise<Membership | null> {
    return getJson<Membership | null>(`/access-api/members/${address}/membership`)
  }
  async getProfile(address: string): Promise<MemberProfile | null> {
    return getJson<MemberProfile | null>(`/access-api/members/${address}/profile`)
  }
  async listMembers(): Promise<MemberRow[]> {
    return getJson<MemberRow[]>('/access-api/members')
  }
  async listResources(): Promise<Resource[]> {
    return getJson<Resource[]>('/access-api/resources')
  }
  async listPolicies(): Promise<AccessPolicy[]> {
    return getJson<AccessPolicy[]>('/access-api/policies')
  }

  // ── Authenticated mutations ────────────────────────────────────────────────

  async assignRole(address: string, role: Role): Promise<void> {
    await getJson<void>(`/access-api/members/${address}/roles`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ role }),
    })
  }

  async updatePolicy(policy: AccessPolicy): Promise<void> {
    await getJson<void>('/access-api/policies', {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(policy),
    })
  }

  // ── SIWE authentication ────────────────────────────────────────────────────

  /**
   * Fetch a one-time nonce for the address.
   * Backend endpoint: POST /access-api/siwe/nonce  { address }
   */
  async getNonce(address: string): Promise<string> {
    const data = await getJson<{ nonce: string }>('/access-api/siwe/nonce', {
      method: 'POST',
      body: JSON.stringify({ address }),
    })
    return data.nonce
  }

  /**
   * Submit the signed EIP-4361 message to the backend for verification.
   * Backend endpoint: POST /access-api/siwe/verify  { message, signature }
   * Response: { token, address, expiresAt }
   */
  async siweVerify(message: string, signature: string): Promise<SiweAuthSession> {
    const data = await getJson<{ token: string; address: string; expiresAt: string }>(
      '/access-api/siwe/verify',
      {
        method: 'POST',
        body: JSON.stringify({ message, signature }),
      },
    )
    return { isAuthenticated: true, ...data }
  }

  /**
   * Invalidate the session on the backend.
   * Backend endpoint: POST /access-api/siwe/logout
   */
  async siweLogout(token: string): Promise<void> {
    await getJson<void>('/access-api/siwe/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {
      // Best-effort: don't block client-side logout if the server call fails
    })
  }
}
