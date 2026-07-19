import { z } from 'zod'
import {
  AccessApi,
  AccessPolicy,
  AnalyticsSummary,
  AnalyticsSummarySchema,
  ApiErrorBody,
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
  BackendSession,
  BackendMember,
  BackendResource,
  BackendPolicy,
  WebhookEventLog,
  SessionSchema,
  CommunitySchema,
  MembershipSchema,
  WalletVerificationSchema,
  MemberProfileSchema,
  MemberRowSchema,
  ResourceSchema,
  AccessPolicySchema,
  WebhookEventLogSchema,
  SiweAuthSessionSchema,
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
  validatePolicyResponse,
  validateResourceResponse,
  validateResourcesResponse,
  validateSessionResponse,
  validateWebhookEventsResponse,
} from './validators'

/** Alias for ApiError — re-exported so admin pages can import AuthError from this module. */
export { ApiError as AuthError } from './errors'

import { PolicyValidationError, validatePolicy } from '../validation/policy'
import { config } from '../config'

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

function normalizeResponseKeys(data: any): any {
  if (data === null || data === undefined) {
    return data
  }
  if (Array.isArray(data)) {
    return data.map(normalizeResponseKeys)
  }
  if (typeof data === 'object') {
    const res: any = {}
    for (const [key, val] of Object.entries(data)) {
      const normalizedVal = normalizeResponseKeys(val)

      let targetKey = key
      if (key === 'wallet_address') targetKey = 'address'
      else if (key === 'membership_tier') targetKey = 'tier'
      else if (key === 'is_active') targetKey = 'active'
      else if (key === 'expires_at') targetKey = 'expiresAt'
      else if (key === 'display_name') targetKey = 'displayName'
      else if (key === 'min_tier') targetKey = 'minTier'
      else if (key === 'resource_id') targetKey = 'resourceId'
      else if (key === 'event_type') targetKey = 'eventType'
      else if (key === 'created_at') targetKey = 'timestamp'
      else if (key === 'affected_identifier') targetKey = 'affectedIdentifier'
      else if (key === 'payload_summary') targetKey = 'payloadSummary'
      else if (key === 'tx_hash') targetKey = 'txHash'

      res[targetKey] = normalizedVal
      if (targetKey !== key) {
        res[key] = normalizedVal
      }
    }

    // Mappers fallbacks
    if (res.name !== undefined && res.title === undefined) {
      res.title = res.name
    }
    if (res.username !== undefined && res.displayName === undefined) {
      res.displayName = res.username
    }
    // Profile address injection fallback (MemberProfile schema requires address but raw profile response doesn't have it)
    if (res.badges !== undefined && res.address === undefined) {
      res.address = '0x0000000000000000000000000000000000000000'
    }
    // SIWE verify response isAuthenticated injection fallback
    if (res.token !== undefined && res.isAuthenticated === undefined) {
      res.isAuthenticated = true
    }

    return res
  }
  return data
}

function validateResponse(raw: any, schema: z.ZodType<any>, path?: string): void {
  const normalized = normalizeResponseKeys(raw)
  const result = schema.safeParse(normalized)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ')
    const errorMsg = `API contract mismatch at ${path || 'unknown'}: ${issues}`

    if (config.apiValidationLogOnly) {
      console.error(errorMsg)
    } else {
      throw new ApiError({
        status: 422,
        code: 'validation_error',
        safeMessage: errorMsg,
        path,
      })
    }
  }
}

// ── Shared HTTP request helper ────────────────────────────────────────────────

/**
 * Options accepted by {@link request}, extending the standard {@link RequestInit}
 * with knobs that let a single code path serve both the core API and the
 * integration gateway without changing observable behavior.
 */
interface RequestOptions extends RequestInit {
  /**
   * Schema used to validate the parsed JSON response. When omitted, the raw
   * parsed body is returned without contract validation.
   */
  schema?: z.ZodType<any>
  /**
   * When `false`, the path is treated as absolute and is NOT prefixed with the
   * configured core API base URL. Integration-gateway calls hit absolute paths
   * (e.g. `/api/integration/...`) and must set this to `false`.
   * Defaults to `true`.
   */
  prefixBase?: boolean
  /**
   * The `safeMessage` surfaced when the underlying `fetch` throws (network
   * failure / DNS / offline). Lets the integration gateway present its own
   * connection-error copy while the core API keeps its own. Defaults to the
   * core API's connection message.
   */
  networkErrorMessage?: string
}

/**
 * The single internal HTTP entry point for this module.
 *
 * Centralizes base-URL joining, default `Content-Type`, JSON parsing, HTTP
 * error mapping, empty-body handling, and optional schema validation so no
 * individual endpoint function has to repeat that logic. Behavior is identical
 * to the previous `getJson` / `getIntegrationJson` pair; those are now thin
 * wrappers over this helper.
 */
async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    schema,
    prefixBase = true,
    networkErrorMessage = 'Unable to connect. Please check your connection and try again.',
    headers,
    ...init
  } = options

  const url = prefixBase ? `${BASE}${path}` : path

  let res: Response

  try {
    res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(headers ?? {}),
      },
    })
  } catch (cause) {
    throw new ApiError({
      code: 'network_error',
      safeMessage: networkErrorMessage,
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

  const raw = parseJsonResponse<any>(text, path)
  if (schema) {
    validateResponse(raw, schema, path)
  }
  return raw as T
}

async function getJson<T>(path: string, init?: RequestInit, schema?: z.ZodType<any>): Promise<T> {
  return request<T>(path, { ...init, schema })
}

async function getIntegrationJson<T>(path: string, schema?: z.ZodType<any>): Promise<T> {
  return request<T>(path, {
    schema,
    prefixBase: false,
    networkErrorMessage:
      'Unable to connect to the integration gateway. Please check your configuration and try again.',
  })
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
    const raw = await getJson<BackendSession>(path, undefined, SessionSchema)
    validateSessionResponse(raw, path)
    const session = mapSession(raw)

    if (this.address) {
      const mPath = `/api/integration/membership?address=${encodeURIComponent(this.address)}`
      try {
        const integrationPath = `/api/integration/membership?address=${encodeURIComponent(this.address)}`
        const integrationMembership = await getIntegrationJson<BackendMember | null>(
          integrationPath,
          MembershipSchema.nullable(),
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
    const raw = await getJson<BackendSession['community']>(path, undefined, CommunitySchema)
    validateCommunityResponse(raw, path)
    return mapCommunity(raw)
  }

  async getMembership(address: string): Promise<Membership | null> {
    const raw = await getIntegrationJson<BackendMember | null>(
      `/api/integration/membership?address=${encodeURIComponent(address)}`,
      MembershipSchema.nullable(),
    )
    return raw ? mapMembership(raw) : null
  }

  async verifyWallet(address: string): Promise<WalletVerification> {
    return await getIntegrationJson<WalletVerification>(
      `/api/integration/verify?address=${encodeURIComponent(address)}`,
      WalletVerificationSchema,
    )
  }

  async getProfile(address: string): Promise<MemberProfile | null> {
    const path = `/v1/members/${encodeURIComponent(address)}/profile`
    const raw = await getJson<BackendMember | null>(path, undefined, MemberProfileSchema.nullable())
    validateMemberProfileResponse(raw, path)
    return raw ? mapMemberProfile(raw, address) : null
  }

  async listMembers(params?: { cursor?: string; limit?: number; filter?: string }): Promise<MemberRow[] | PaginatedMembers> {
    const query = new URLSearchParams()
    if (params?.cursor) query.append('cursor', params.cursor)
    if (params?.limit !== undefined) query.append('limit', String(params.limit))
    if (params?.filter) query.append('filter', params.filter)

    const queryString = query.toString() ? `?${query.toString()}` : ''
    const path = `/v1/members${queryString}`

    const schema = z.union([
      z.array(MemberRowSchema),
      z.object({
        members: z.array(MemberRowSchema),
        nextCursor: z.string().optional().nullable(),
      }),
    ])

    const raw = await getJson<BackendMember[] | { members: BackendMember[]; nextCursor?: string }>(path, undefined, schema)

    if (Array.isArray(raw)) {
      validateMemberRowsResponse(raw, path)
      return raw.map(mapMemberRow)
    } else {
      validateMemberRowsResponse(raw.members, path)
      return {
        members: raw.members.map(mapMemberRow),
        nextCursor: raw.nextCursor,
      }
    }
  }

  async listResources(): Promise<Resource[]> {
    const path = '/v1/resources'
    const raw = await getJson<BackendResource[]>(path, undefined, z.array(ResourceSchema))
    validateResourcesResponse(raw, path)
    return raw.map(mapResource)
  }

  async listPolicies(): Promise<AccessPolicy[]> {
    const path = '/v1/policies'
    const raw = await getJson<BackendPolicy[]>(path, undefined, z.array(AccessPolicySchema))
    validatePoliciesResponse(raw, path)
    return raw.map(mapPolicy)
  }

  async getResource(id: string): Promise<Resource | null> {
    const path = `/v1/resources/${encodeURIComponent(id)}`
    try {
      const raw = await getJson<BackendResource>(path, undefined, ResourceSchema)
      if (raw && Object.keys(raw).length > 0) {
        validateResourceResponse(raw, path)
        return mapResource(raw)
      }
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) {
        throw err
      }
    }

    // Fallback for older backends or if direct lookup returned empty/404
    const list = await this.listResources()
    return list.find((r) => r.id === id) ?? null
  }

  async getPolicy(resourceId: string): Promise<AccessPolicy | null> {
    const path = `/v1/policies/${encodeURIComponent(resourceId)}`
    try {
      const raw = await getJson<BackendPolicy>(path, undefined, AccessPolicySchema)
      if (raw && Object.keys(raw).length > 0) {
        validatePolicyResponse(raw, path)
        return mapPolicy(raw)
      }
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) {
        throw err
      }
    }

    // Fallback for older backends or if direct lookup returned empty/404
    const list = await this.listPolicies()
    return list.find((p) => p.resourceId === resourceId) ?? null
  }

  // ── Admin queries & mutations (require a valid SIWE token) ─────────────────

  async listWebhookEvents(): Promise<WebhookEventLog[]> {
    const path = '/v1/admin/events'
    const raw = await getJson<any[]>(path, {
      method: 'GET',
      headers: this.authHeaders(),
    }, z.array(WebhookEventLogSchema))
    validateWebhookEventsResponse(raw, path)
    return raw.map(mapWebhookEvent)
  }

  /**
   * Fetch the analytics summary for the admin dashboard.
   *
   * PROVISIONAL — `GET /v1/admin/analytics` does not yet exist in guildpass-core.
   * This endpoint path is a proposal based on the existing `/v1/admin/*` namespace
   * convention. The live implementation is included so the contract is visible and
   * the backend team can confirm or adjust the path before the endpoint ships.
   * Tracked in issue #157.
   *
   * Expected response shape: {@link AnalyticsSummary}
   */
  async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    const path = '/v1/admin/analytics'
    return getJson<AnalyticsSummary>(path, {
      method: 'GET',
      headers: this.authHeaders(),
    }, AnalyticsSummarySchema)
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
    }, z.object({ nonce: z.string() }))
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
      refreshToken?: string
      refreshExpiresAt?: string
    }>('/v1/auth/siwe/verify', {
      method: 'POST',
      body: JSON.stringify({ message, signature }),
    }, SiweAuthSessionSchema)

    return { isAuthenticated: true, ...data }
  }

  /**
   * Exchange a refresh token for a new access token (and rotated refresh
   * token).  Calls the proposed `POST /v1/auth/siwe/refresh` endpoint.
   *
   * The backend contract is:
   *   Request body:  `{ "refreshToken": "<opaque>" }`
   *   Success (200): same shape as `/v1/auth/siwe/verify` response
   *   Failure (401): refresh token expired or invalid → must re-sign
   *
   * This method is intentionally *not* best-effort: if the network call
   * fails for any reason, the error propagates so the caller can decide
   * whether to retry or transition the user to the 'expired' state.
   */
  async siweRefresh(refreshToken: string): Promise<SiweAuthSession> {
    const data = await getJson<{
      token: string
      address: string
      expiresAt: string
      refreshToken?: string
      refreshExpiresAt?: string
    }>('/v1/auth/siwe/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }, SiweAuthSessionSchema)

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