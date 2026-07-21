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
  ResourceLookupResult,
  Role,
  Session,
  SiweAuthSession,
  WalletVerification,
  BackendSession,
  BackendMember,
  BackendResource,
  BackendPolicy,
  WebhookEventLog,
  WebhookEventUnsubscribe,
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

type CircuitState = 'closed' | 'open' | 'half-open'

interface CircuitEntry {
  state: CircuitState
  failures: number[]
  openedAt?: number
  halfOpenProbeInFlight: boolean
}

const RETRY_MAX_ATTEMPTS = Number(
  process.env.NEXT_PUBLIC_API_RETRY_MAX_ATTEMPTS ?? 3,
)
const RETRY_BASE_DELAY_MS = Number(
  process.env.NEXT_PUBLIC_API_RETRY_BASE_DELAY_MS ?? 100,
)
const RETRY_MAX_DELAY_MS = Number(
  process.env.NEXT_PUBLIC_API_RETRY_MAX_DELAY_MS ?? 1_000,
)
const CIRCUIT_FAILURE_THRESHOLD = Number(
  process.env.NEXT_PUBLIC_API_CIRCUIT_FAILURE_THRESHOLD ?? 3,
)
const CIRCUIT_FAILURE_WINDOW_MS = Number(
  process.env.NEXT_PUBLIC_API_CIRCUIT_FAILURE_WINDOW_MS ?? 30_000,
)
const CIRCUIT_COOLDOWN_MS = Number(
  process.env.NEXT_PUBLIC_API_CIRCUIT_COOLDOWN_MS ?? 10_000,
)

const circuitBreakers = new Map<string, CircuitEntry>()

function requestMethod(init?: RequestInit): string {
  return (init?.method ?? 'GET').toUpperCase()
}

function shouldRetryRequest(init?: RequestInit | RequestOptions): boolean {
  return requestMethod(init) === 'GET'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function backoffDelayMs(attemptIndex: number): number {
  const exponentialDelay = Math.min(
    RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attemptIndex - 1),
    RETRY_MAX_DELAY_MS,
  )
  const jitter = Math.floor(Math.random() * exponentialDelay * 0.25)
  return exponentialDelay + jitter
}

function getCircuit(path: string): CircuitEntry {
  let circuit = circuitBreakers.get(path)
  if (!circuit) {
    circuit = { state: 'closed', failures: [], halfOpenProbeInFlight: false }
    circuitBreakers.set(path, circuit)
  }
  return circuit
}

function serviceUnavailableError(path: string): ApiError {
  return new ApiError({
    status: 503,
    code: 'service_unavailable',
    safeMessage: 'Service temporarily unavailable. Please try again shortly.',
    path,
    retryable: true,
  })
}

function assertCircuitAllowsRequest(path: string): void {
  const circuit = getCircuit(path)
  if (circuit.state !== 'open') {
    return
  }

  const openedAt = circuit.openedAt ?? 0
  if (Date.now() - openedAt >= CIRCUIT_COOLDOWN_MS) {
    circuit.state = 'half-open'
    circuit.halfOpenProbeInFlight = false
  } else {
    throw serviceUnavailableError(path)
  }

  if (circuit.halfOpenProbeInFlight) {
    throw serviceUnavailableError(path)
  }
  circuit.halfOpenProbeInFlight = true
}

function recordCircuitSuccess(path: string): void {
  const circuit = getCircuit(path)
  circuit.state = 'closed'
  circuit.failures = []
  circuit.openedAt = undefined
  circuit.halfOpenProbeInFlight = false
}

function recordCircuitFailure(path: string): void {
  const now = Date.now()
  const circuit = getCircuit(path)
  circuit.failures = circuit.failures.filter(
    (failureAt) => now - failureAt <= CIRCUIT_FAILURE_WINDOW_MS,
  )
  circuit.failures.push(now)
  circuit.halfOpenProbeInFlight = false

  if (
    circuit.state === 'half-open' ||
    circuit.failures.length >= CIRCUIT_FAILURE_THRESHOLD
  ) {
    circuit.state = 'open'
    circuit.openedAt = now
  }
}

function isRetryableError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.retryable &&
    (err.code === 'network_error' ||
      err.code === 'server_error' ||
      err.code === 'rate_limited')
  )
}

export function resetLiveApiResilienceState(): void {
  circuitBreakers.clear()
}

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

function parseSseEvent(chunk: string): WebhookEventLog[] {
  return chunk
    .split('\n\n')
    .map((block) => {
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')

      if (!data || data === '[DONE]') return null
      const parsed = JSON.parse(data)
      WebhookEventLogSchema.parse(parsed)
      return mapWebhookEvent(parsed)
    })
    .filter((event): event is WebhookEventLog => event !== null)
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
 * Options accepted by {@link getJson}, extending the standard {@link RequestInit}
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
 * Returns true when the error represents an aborted fetch (DOMException with
 * name "AbortError", or any error whose name is "AbortError").
 */
function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'AbortError' ||
      (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError'))
  )
}

/**
 * The single internal HTTP entry point for this module.
 *
 * Centralizes base-URL joining, default `Content-Type`, JSON parsing, HTTP
 * error mapping, empty-body handling, schema validation, retry logic, and the
 * per-path circuit breaker.
 *
 * An `AbortSignal` can be passed via `options.signal`. When the signal fires
 * the in-flight fetch is cancelled, the retry loop exits immediately, and an
 * `ApiError` with `code: 'aborted'` is thrown. Aborted requests are **never**
 * counted by the circuit breaker.
 */
async function getJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    schema,
    prefixBase = true,
    networkErrorMessage = 'Unable to connect. Please check your connection and try again.',
    headers,
    signal,
    ...init
  } = options

  const url = prefixBase ? `${BASE}${path}` : path
  const retriesEnabled = shouldRetryRequest(options)

  if (retriesEnabled) {
    assertCircuitAllowsRequest(path)
  }

  let res!: Response

  for (let attempt = 1; ; attempt += 1) {
    // Bail out immediately if the caller already aborted before we even fetch
    if (signal?.aborted) {
      throw new ApiError({
        code: 'aborted',
        safeMessage: 'Request was cancelled.',
        retryable: false,
      })
    }

    try {
      res = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(headers ?? {}),
        },
        signal,
      })

      if (!res.ok) {
        throw createApiError(res.status, await parseErrorBody(res), path)
      }

      if (retriesEnabled) {
        recordCircuitSuccess(path)
      }
      break
    } catch (err) {
      // Aborts must never be retried or counted as circuit-breaker failures
      if (isAbortError(err)) {
        throw new ApiError({
          code: 'aborted',
          safeMessage: 'Request was cancelled.',
          retryable: false,
          cause: err,
        })
      }

      // Wrap raw network errors (fetch throwing, not an HTTP error response)
      if (!(err instanceof ApiError)) {
        const networkErr = new ApiError({
          code: 'network_error',
          safeMessage: networkErrorMessage,
          retryable: true,
          cause: err,
        })
        if (retriesEnabled) {
          recordCircuitFailure(path)
        }
        throw networkErr
      }

      const canRetry =
        retriesEnabled &&
        isRetryableError(err) &&
        attempt < RETRY_MAX_ATTEMPTS

      if (!canRetry) {
        if (retriesEnabled && isRetryableError(err)) {
          recordCircuitFailure(path)
        }
        throw err
      }

      await sleep(backoffDelayMs(attempt))
    }
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

/**
 * Convenience wrapper for integration-gateway calls. These calls use an
 * absolute path (no BASE prefix) and present their own network-error copy.
 */
async function getIntegrationJson<T>(path: string, schema?: z.ZodType<any>, signal?: AbortSignal): Promise<T> {
  return getJson<T>(path, {
    schema,
    prefixBase: false,
    networkErrorMessage:
      'Unable to connect to the integration gateway. Please check your configuration and try again.',
    signal,
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

  async getSession(signal?: AbortSignal): Promise<Session> {
    const addr = this.address
      ? `?address=${encodeURIComponent(this.address)}`
      : ''
    const path = `/v1/session${addr}`
    const raw = await getJson<BackendSession>(path, { schema: SessionSchema, signal })
    validateSessionResponse(raw, path)
    const session = mapSession(raw)

    if (this.address) {
      try {
        const integrationPath = `/api/integration/membership?address=${encodeURIComponent(this.address)}`
        const integrationMembership = await getIntegrationJson<BackendMember | null>(
          integrationPath,
          MembershipSchema.nullable(),
          signal,
        )
        validateMembershipResponse(integrationMembership, integrationPath)
        if (integrationMembership) {
          session.membership = mapMembership(integrationMembership)
        }
      } catch (err) {
        // Re-throw aborts — don't swallow cancellation
        if (err instanceof ApiError && err.code === 'aborted') throw err
        // If the integration gateway is unavailable, retain the membership data
        // returned by the core API rather than failing the entire session.
      }
    }

    return session
  }

  async getCommunity(signal?: AbortSignal): Promise<Community> {
    const path = '/v1/community'
    const raw = await getJson<BackendSession['community']>(path, { schema: CommunitySchema, signal })
    validateCommunityResponse(raw, path)
    return mapCommunity(raw)
  }

  async getMembership(address: string, signal?: AbortSignal): Promise<Membership | null> {
    const raw = await getIntegrationJson<BackendMember | null>(
      `/api/integration/membership?address=${encodeURIComponent(address)}`,
      MembershipSchema.nullable(),
      signal,
    )
    return raw ? mapMembership(raw) : null
  }

  async verifyWallet(address: string, signal?: AbortSignal): Promise<WalletVerification> {
    return await getIntegrationJson<WalletVerification>(
      `/api/integration/verify?address=${encodeURIComponent(address)}`,
      WalletVerificationSchema,
      signal,
    )
  }

  async getProfile(address: string, signal?: AbortSignal): Promise<MemberProfile | null> {
    const path = `/v1/members/${encodeURIComponent(address)}/profile`
    const raw = await getJson<BackendMember | null>(path, { schema: MemberProfileSchema.nullable(), signal })
    validateMemberProfileResponse(raw, path)
    return raw ? mapMemberProfile(raw, address) : null
  }

  async listMembers(params?: { cursor?: string; limit?: number; filter?: string }, signal?: AbortSignal): Promise<MemberRow[] | PaginatedMembers> {
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

    const raw = await getJson<BackendMember[] | { members: BackendMember[]; nextCursor?: string }>(path, { schema, signal })

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

  async listResources(signal?: AbortSignal): Promise<Resource[]> {
    const path = '/v1/resources'
    const raw = await getJson<BackendResource[]>(path, { schema: z.array(ResourceSchema), signal })
    validateResourcesResponse(raw, path)
    return raw.map(mapResource)
  }

  async listPolicies(signal?: AbortSignal): Promise<AccessPolicy[]> {
    const path = '/v1/policies'
    const raw = await getJson<BackendPolicy[]>(path, { schema: z.array(AccessPolicySchema), signal })
    validatePoliciesResponse(raw, path)
    return raw.map(mapPolicy)
  }

  async getResource(id: string, signal?: AbortSignal): Promise<ResourceLookupResult> {
    const path = `/v1/resources/${encodeURIComponent(id)}`
    try {
      const raw = await getJson<BackendResource>(path, { schema: ResourceSchema, signal })
      if (raw && Object.keys(raw).length > 0) {
        validateResourceResponse(raw, path)
        return { status: 'found', data: mapResource(raw), source: 'direct' }
      }
    } catch (err) {
      // Re-throw aborts immediately
      if (err instanceof ApiError && err.code === 'aborted') throw err
      if (!(err instanceof ApiError && err.status === 404)) {
        return {
          status: 'error',
          error: err instanceof ApiError
            ? err
            : new ApiError({
              code: 'unknown_error',
              safeMessage: 'Request failed.',
              path,
              cause: err,
            }),
        }
      }
    }

    // Fallback for older backends or if direct lookup returned empty/404
    try {
      const list = await this.listResources(signal)
      const resource = list.find((r) => r.id === id)
      return resource
        ? { status: 'found', data: resource, source: 'fallback' }
        : { status: 'not_found' }
    } catch (err) {
      return {
        status: 'error',
        error: err instanceof ApiError
          ? err
          : new ApiError({
            code: 'unknown_error',
            safeMessage: 'Request failed.',
            cause: err,
          }),
      }
    }
  }

  async getPolicy(resourceId: string, signal?: AbortSignal): Promise<AccessPolicy | null> {
    const path = `/v1/policies/${encodeURIComponent(resourceId)}`
    try {
      const raw = await getJson<BackendPolicy>(path, { schema: AccessPolicySchema, signal })
      if (raw && Object.keys(raw).length > 0) {
        validatePolicyResponse(raw, path)
        return mapPolicy(raw)
      }
    } catch (err) {
      // Re-throw aborts immediately
      if (err instanceof ApiError && err.code === 'aborted') throw err
      if (!(err instanceof ApiError && err.status === 404)) {
        throw err
      }
    }

    // Fallback for older backends or if direct lookup returned empty/404
    const list = await this.listPolicies(signal)
    return list.find((p) => p.resourceId === resourceId) ?? null
  }

  // ── Admin queries & mutations (require a valid SIWE token) ─────────────────

  async listWebhookEvents(signal?: AbortSignal): Promise<WebhookEventLog[]> {
    const path = '/v1/admin/events'
    const raw = await getJson<any[]>(path, {
      method: 'GET',
      headers: this.authHeaders(),
      schema: z.array(WebhookEventLogSchema),
      signal,
    })
    validateWebhookEventsResponse(raw, path)
    return raw.map(mapWebhookEvent)
  }

  subscribeWebhookEvents(
    onEvent: (event: WebhookEventLog) => void,
    onError?: (error: unknown) => void,
  ): WebhookEventUnsubscribe {
    const path = '/v1/admin/events/stream'
    const controller = new AbortController()
    let buffer = ''

    /**
     * PROVISIONAL — `GET /v1/admin/events/stream` is a proposed guildpass-core
     * SSE endpoint. It should return `text/event-stream` frames whose `data:`
     * payload is a single WebhookEventLog object. Until the backend ships this
     * contract, failures are intentionally reported to the caller so the UI can
     * silently resume the existing `/v1/admin/events` polling behavior.
     */
    fetch(`${BASE}${path}`, {
      method: 'GET',
      headers: {
        ...this.authHeaders(),
        Accept: 'text/event-stream',
      },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok || !res.body) {
          const body = await parseErrorBody(res).catch(() => undefined)
          throw createApiError(res.status, body, path)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()

        while (!controller.signal.aborted) {
          const { done, value } = await reader.read()
          if (done) {
            throw new Error('Admin events stream closed before unsubscribe')
          }
          buffer += decoder.decode(value, { stream: true })
          const frames = buffer.split('\n\n')
          buffer = frames.pop() ?? ''
          for (const frame of frames) {
            for (const event of parseSseEvent(frame)) {
              onEvent(event)
            }
          }
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) onError?.(err)
      })

    return () => controller.abort()
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
  async getAnalyticsSummary(signal?: AbortSignal): Promise<AnalyticsSummary> {
    const path = '/v1/admin/analytics'
    return getJson<AnalyticsSummary>(path, {
      method: 'GET',
      headers: this.authHeaders(),
      schema: AnalyticsSummarySchema,
      signal,
    })
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
      schema: z.object({ nonce: z.string() }),
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
      refreshToken?: string
      refreshExpiresAt?: string
    }>('/v1/auth/siwe/verify', {
      method: 'POST',
      body: JSON.stringify({ message, signature }),
      schema: SiweAuthSessionSchema,
    })

    return { isAuthenticated: true, ...data }
  }

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
      schema: SiweAuthSessionSchema,
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