import {
  AccessApi,
  AccessPolicy,
  ApiErrorBody,
  Community,
  MemberProfile,
  MemberRow,
  Membership,
  Resource,
  Role,
  Session,
 SiweAuthSession,
  BackendSession,
  BackendMember,
  BackendResource,
  BackendPolicy,
} from './types'
import { ApiError } from './errors'

function getCoreApiUrl(): string {
  return process.env.NEXT_PUBLIC_CORE_API_URL || 'http://localhost:4000'
}

const BASE = getCoreApiUrl()

function createApiError(status: number, body?: ApiErrorBody): ApiError {
  const details =
    body?.details && typeof body.details === 'object'
      ? body.details
      : undefined

  if (status === 400) {
    return new ApiError({
      status,
      code: 'bad_request',
      safeMessage: body?.message || 'The request could not be processed.',
      details,
    })
  }

  if (status === 401) {
    return new ApiError({
      status,
      code: 'unauthorized',
      safeMessage: 'Session expired. Please sign in again.',
    })
  }

  if (status === 403) {
    return new ApiError({
      status,
      code: 'forbidden',
      safeMessage: 'You do not have permission to perform this action.',
    })
  }

  if (status === 404) {
    return new ApiError({
      status,
      code: 'not_found',
      safeMessage: 'The requested resource could not be found.',
    })
  }

  if (status === 422) {
    return new ApiError({
      status,
      code: 'validation_error',
      safeMessage:
        body?.message || 'Some of the submitted data is invalid.',
      details,
    })
  }

  if (status === 429) {
    return new ApiError({
      status,
      code: 'rate_limited',
      safeMessage: 'Too many requests. Please try again shortly.',
      retryable: true,
    })
  }

  if (status >= 500) {
    return new ApiError({
      status,
      code: 'server_error',
      safeMessage:
        'The server could not complete the request. Please try again.',
      retryable: true,
    })
  }

  return new ApiError({
    status,
    code: 'unknown_error',
    safeMessage: body?.message || 'Request failed.',
  })
}

async function parseErrorBody(
  res: Response,
): Promise<ApiErrorBody | undefined> {
  const text = await res.text()
  if (!text.trim()) return undefined

  try {
    const body = JSON.parse(text)
    return body && typeof body === 'object'
      ? (body as ApiErrorBody)
      : undefined
  } catch {
    return undefined
  }
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response

  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
  } catch (cause) {
    throw new ApiError({
      code: 'network_error',
      safeMessage:
        'Unable to connect. Please check your connection and try again.',
      retryable: true,
      cause,
    })
  }

  if (!res.ok) {
    throw createApiError(res.status, await parseErrorBody(res))
  }

  if (res.status === 204 || res.status === 205) {
    return {} as T
  }

  const text = await res.text()
  if (!text.trim()) {
    return {} as T
  }

  return JSON.parse(text) as T
}

// ── Response mappers ──────────────────────────────────────────────────────────

function mapCommunity(raw: BackendSession['community']): Community {
  if (!raw) {
    return {
      id: 'unknown',
      name: 'Unknown Community',
      description: '',
      tiers: ['free'],
    }
  }

  return {
    id: raw.id ?? '',
    name: raw.name ?? '',
    description: raw.description,
    tiers: raw.tiers ?? ['free', 'standard', 'pro'],
  }
}

function mapMembership(raw: BackendMember): Membership {
  return {
    address: raw.address ?? raw.wallet_address ?? '',
    tier: raw.tier ?? raw.membership_tier ?? 'free',
    active: raw.active ?? raw.is_active ?? false,
    expiresAt: raw.expiresAt ?? raw.expires_at,
  }
}

function mapMemberProfile(raw: any, address: string): MemberProfile {
  return {
    address,
    displayName:
      raw.displayName ?? raw.display_name ?? raw.username ?? 'Unknown',
    bio: raw.bio,
    badges: raw.badges ?? [],
  }
}

function mapMemberRow(raw: any): MemberRow {
  return {
    address: raw.address ?? raw.wallet_address ?? '',
    roles: raw.roles ?? [],
    tier: raw.tier ?? raw.membership_tier ?? 'free',
    active: raw.active ?? raw.is_active ?? false,
  }
}

function mapResource(raw: any): Resource {
  return {
    id: raw.id ?? '',
    title: raw.title ?? raw.name ?? 'Untitled',
    description: raw.description,
    minTier: raw.minTier ?? raw.min_tier,
    roles: raw.roles ?? [],
  }
}

function mapPolicy(raw: any): AccessPolicy {
  return {
    resourceId: raw.resourceId ?? raw.resource_id ?? '',
    minTier: raw.minTier ?? raw.min_tier ?? 'free',
    roles: raw.roles ?? [],
  }
}

function mapSession(raw: any): Session {
  return {
    address: raw.address ?? raw.wallet_address ?? '',
    roles: raw.roles ?? [],
    membership: raw.membership
      ? mapMembership(raw.membership as BackendMember)
      : undefined,
    community: raw.community ? mapCommunity(raw.community) : undefined,
  }
}

// ── LiveAccessApi ─────────────────────────────────────────────────────────────

export class LiveAccessApi implements AccessApi {
  constructor(
    private readonly address?: string,
    private readonly token?: string,
  ) {}

  private authHeaders(): HeadersInit {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {}
  }

  async getSession(): Promise<Session> {
    const addr = this.address
      ? `?address=${encodeURIComponent(this.address)}`
      : ''
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

  async getNonce(address: string): Promise<string> {
    const data = await getJson<{ nonce: string }>('/v1/auth/siwe/nonce', {
      method: 'POST',
      body: JSON.stringify({ address }),
    })
    return data.nonce
  }

  async siweVerify(
    message: string,
    signature: string,
  ): Promise<SiweAuthSession> {
    const data = await getJson<{
      token: string
      address: string
      expiresAt: string
    }>('/v1/auth/siwe/verify', {
      method: 'POST',
      body: JSON.stringify({ message, signature }),
    })

    return { isAuthenticated: true, ...data }
  }

  async siweLogout(token: string): Promise<void> {
    await getJson<void>('/v1/auth/siwe/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {
      // best-effort logout
    })
  }
}
