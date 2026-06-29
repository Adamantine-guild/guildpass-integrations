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
  WalletVerification,
  BackendSession,
  BackendMember,
  BackendResource,
  BackendPolicy,
  WebhookEventLog,
} from './types'
import {
  mapCommunity,
  mapMembership,
  mapMemberProfile,
  mapMemberRow,
  mapResource,
  mapPolicy,
  mapSession,
  mapWebhookEvent,
} from './mappers'
import { ApiError } from './errors'
import {
  validateCommunityResponse,
  validateMemberProfileResponse,
  validateMemberRowsResponse,
  validateMembershipResponse,
  validatePoliciesResponse,
  validateResourcesResponse,
  validateSessionResponse,
  validateWebhookEventsResponse,
} from './validators'

/** Alias for ApiError — re-exported so admin pages can import AuthError from this module. */
export { ApiError as AuthError } from './errors'

import { PolicyValidationError, validatePolicy } from '@/lib/validation/policy'
import { config } from '@/lib/config'

const BASE = config.apiUrl

function createApiError(status: number, body?: ApiErrorBody, path?: string): ApiError {
  const details =
    body?.details && typeof body.details === 'object'
      ? body.details
      : undefined

  if (status === 400) {
    return new ApiError({
      status,
      code: 'bad_request',
      safeMessage: body?.message || 'The request could not be processed.',
      path,
      details,
    })
  }

  if (status === 401) {
    return new ApiError({
      status,
      code: 'unauthorized',
      safeMessage: 'Session expired. Please sign in again.',
      path,
    })
  }

  if (status === 403) {
    return new ApiError({
      status,
      code: 'forbidden',
      safeMessage: 'You do not have permission to perform this action.',
      path,
    })
  }

  if (status === 404) {
    return new ApiError({
      status,
      code: 'not_found',
      safeMessage: 'The requested resource could not be found.',
      path,
    })
  }

  if (status === 422) {
    return new ApiError({
      status,
      code: 'validation_error',
      safeMessage:
        body?.message || 'Some of the submitted data is invalid.',
      path,
      details,
    })
  }

  if (status === 429) {
    return new ApiError({
      status,
      code: 'rate_limited',
      safeMessage: 'Too many requests. Please try again shortly.',
      path,
      retryable: true,
    })
  }

  if (status >= 500) {
    return new ApiError({
      status,
      code: 'server_error',
      safeMessage:
        body?.message ||
        body?.error ||
        'The server could not complete the request. Please try again.',
      path,
      retryable: true,
    })
  }

  return new ApiError({
    status,
    code: 'unknown_error',
    safeMessage: body?.message || 'Request failed.',
    path,
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
    throw createApiError(res.status, await parseErrorBody(res), path)
  }

  if (res.status === 204 || res.status === 205) {
    return {} as T
  }

  const text = await res.text()
  if (!text.trim()) {
    return {} as T
  }

  return parseJsonResponse<T>(text, path)
}

async function getIntegrationJson<T>(path: string): Promise<T> {
  let res: Response

  try {
    res = await fetch(path, {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (cause) {
    throw new ApiError({
      code: 'network_error',
      safeMessage:
        'Unable to connect to the integration gateway. Please check your configuration and try again.',
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

  return parseJsonResponse<T>(text, path)
}

function parseJsonResponse<T>(text: string, path?: string): T {
  try {
    return JSON.parse(text) as T
  } catch (cause) {
    throw new ApiError({
      code: 'validation_error',
      safeMessage: 'Received an invalid response from the server.',
      path,
      cause,
    })
  }
}

// ── Response mappers are now in ./mappers ─────────────────────────────────────

// ── LiveAccessApi ─────────────────────────────────────────────────────────────

export class LiveAccessApi implements AccessApi {
  constructor(
    private readonly address?: string,
    private readonly token?: string,
  ) { }

  private authHeaders(): HeadersInit {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {}
  }

  async getSession(): Promise<Session> {
    const addr = this.address
      ? `?address=${encodeURIComponent(this.address)}`
      : ''
    const path = `/v1/session${addr}`
    const raw = await getJson<BackendSession>(path)
    validateSessionResponse(raw, path)
    const session = mapSession(raw)

    if (this.address) {
      try {
        const integrationPath = `/api/integration/membership?address=${encodeURIComponent(this.address)}`
        const integrationMembership = await getIntegrationJson<BackendMember | null>(
          integrationPath,
        )
        validateMembershipResponse(integrationMembership, integrationPath)
        if (integrationMembership) {
          session.membership = mapMembership(integrationMembership)
        }
      } catch {
        // If the integration gateway is unavailable, retain the membership data
        // returned by the core API rather than failing the entire session.
      }
    }

    return session
  }

  async getCommunity(): Promise<Community> {
    const path = '/v1/community'
    const raw = await getJson<BackendSession['community']>(path)
    validateCommunityResponse(raw, path)
    return mapCommunity(raw)
  }

  async getMembership(address: string): Promise<Membership | null> {
    const raw = await getIntegrationJson<BackendMember | null>(
      `/api/integration/membership?address=${encodeURIComponent(address)}`,
    )
    return raw ? mapMembership(raw) : null
  }

  async verifyWallet(address: string): Promise<WalletVerification> {
    return await getIntegrationJson<WalletVerification>(
      `/api/integration/verify?address=${encodeURIComponent(address)}`,
    )
  }

  async getProfile(address: string): Promise<MemberProfile | null> {
    const path = `/v1/members/${encodeURIComponent(address)}/profile`
    const raw = await getJson<BackendMember | null>(path)
    validateMemberProfileResponse(raw, path)
    return raw ? mapMemberProfile(raw, address) : null
  }

  async listMembers(): Promise<MemberRow[]> {
    const path = '/v1/members'
    const raw = await getJson<BackendMember[]>(path)
    validateMemberRowsResponse(raw, path)
    return raw.map(mapMemberRow)
  }

  async listResources(): Promise<Resource[]> {
    const path = '/v1/resources'
    const raw = await getJson<BackendResource[]>(path)
    validateResourcesResponse(raw, path)
    return raw.map(mapResource)
  }

  async listPolicies(): Promise<AccessPolicy[]> {
    const path = '/v1/policies'
    const raw = await getJson<BackendPolicy[]>(path)
    validatePoliciesResponse(raw, path)
    return raw.map(mapPolicy)
  }

  async getResource(id: string): Promise<Resource | null> {
    const list = await this.listResources()
    return list.find((r) => r.id === id) ?? null
  }

  async getPolicy(resourceId: string): Promise<AccessPolicy | null> {
    const list = await this.listPolicies()
    return list.find((p) => p.resourceId === resourceId) ?? null
  }

  // ── Admin queries & mutations (require a valid SIWE token) ─────────────────

  async listWebhookEvents(): Promise<WebhookEventLog[]> {
    const path = '/v1/admin/events'
    const raw = await getJson<any[]>(path, {
      method: 'GET',
      headers: this.authHeaders(),
    })
    validateWebhookEventsResponse(raw, path)
    return raw.map(mapWebhookEvent)
  }

  async assignRole(address: string, role: Role): Promise<void> {
    await getJson<void>(`/v1/members/${encodeURIComponent(address)}/roles`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ role }),
    })
  }

  async removeRole(address: string, role: Role): Promise<void> {
    await getJson<void>(
      `/v1/members/${encodeURIComponent(address)}/roles/${encodeURIComponent(role)}`,
      {
        method: 'DELETE',
        headers: this.authHeaders(),
      },
    )
  }

  async updatePolicy(policy: AccessPolicy): Promise<void> {
    const result = validatePolicy(policy)

    if (!result.valid) {
      throw new PolicyValidationError(result.errors)
    }

    await getJson(`/v1/policies/${encodeURIComponent(result.value.resourceId)}`, {
      method: 'PUT',
      headers: this.authHeaders(),
      body: JSON.stringify({
        resource_id: result.value.resourceId,
        min_tier: result.value.minTier,
        roles: result.value.roles,
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
