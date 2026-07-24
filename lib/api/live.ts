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

// ── Circuit Breaker & Retry Logic ──────────────────────────────────────────────

const CIRCUIT_FAILURE_THRESHOLD = 3
const CIRCUIT_FAILURE_WINDOW_MS = 30000

interface CircuitEntry {
  failures: number
  firstFailureAt: number
}

const circuitBreakers = new Map<string, CircuitEntry>()

function getCircuit(path: string): CircuitEntry {
  let entry = circuitBreakers.get(path)
  if (!entry) {
    entry = { failures: 0, firstFailureAt: 0 }
    circuitBreakers.set(path, entry)
  }
  return entry
}

export function isCircuitOpen(path: string): boolean {
  const entry = circuitBreakers.get(path)
  if (!entry) return false
  
  if (entry.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    if (Date.now() - entry.firstFailureAt < CIRCUIT_FAILURE_WINDOW_MS) {
      return true
    } else {
      // Time window passed, reset
      entry.failures = 0
      entry.firstFailureAt = 0
      return false
    }
  }
  return false
}

function assertCircuitAllowsRequest(path: string) {
  if (isCircuitOpen(path)) {
    throw new ApiError({
      status: 503,
      code: 'service_unavailable',
      safeMessage: 'Service is temporarily unavailable due to repeated failures.',
      path,
      retryable: true,
    })
  }
}

function recordCircuitFailure(path: string) {
  const entry = getCircuit(path)
  const now = Date.now()
  if (entry.failures === 0 || now - entry.firstFailureAt >= CIRCUIT_FAILURE_WINDOW_MS) {
    entry.failures = 1
    entry.firstFailureAt = now
  } else {
    entry.failures++
  }
}

function recordCircuitSuccess(path: string) {
  const entry = circuitBreakers.get(path)
  if (entry) {
    entry.failures = 0
    entry.firstFailureAt = 0
  }
}

function shouldRetryRequest(method: string, error: ApiError, attempt: number): boolean {
  const MAX_RETRIES = 3;
  if (method !== 'GET') return false; // Only retry GETs by design
  if (attempt >= MAX_RETRIES) return false;
  return error.retryable === true;
}

const backoffDelayMs = (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 10000);

function normalizeCircuitPath(path: string): string {
  let base = path.split('?')[0];
  // Replace ethereum addresses with a placeholder so they share the same circuit
  base = base.replace(/0x[a-fA-F0-9]{40}/g, ':address');
  return base;
}

async function executeWithResilience<T>(
  path: string, 
  method: string, 
  fetchFn: () => Promise<Response>
): Promise<T> {
  const circuitPath = normalizeCircuitPath(path);
  let attempt = 0;

  while (true) {
    assertCircuitAllowsRequest(circuitPath);

    let res: Response;
    try {
      res = await fetchFn();
    } catch (cause) {
      recordCircuitFailure(circuitPath);
      const err = new ApiError({
        code: 'network_error',
        safeMessage: 'Unable to connect. Please check your connection and try again.',
        retryable: true,
        cause,
      });
      if (shouldRetryRequest(method, err, attempt)) {
        attempt++;
        await new Promise(r => setTimeout(r, backoffDelayMs(attempt)));
        continue;
      }
      throw err;
    }

    if (!res.ok) {
      const errBody = await parseErrorBody(res);
      const apiErr = createApiError(res.status, errBody, path);
      if (res.status >= 500) {
        recordCircuitFailure(circuitPath);
      }
      
      if (shouldRetryRequest(method, apiErr, attempt)) {
        attempt++;
        await new Promise(r => setTimeout(r, backoffDelayMs(attempt)));
        continue;
      }
      throw apiErr;
    }

    recordCircuitSuccess(circuitPath);

    if (res.status === 204 || res.status === 205) {
      return {} as T
    }

    const text = await res.text()
    if (!text.trim()) {
      return {} as T
    }

    return JSON.parse(text) as T
  }
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET'
  return executeWithResilience<T>(path, method, () => 
    fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
  )
}

async function getIntegrationJson<T>(path: string): Promise<T> {
  return executeWithResilience<T>(path, 'GET', () => 
    fetch(path, {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  )
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
    const raw = await getJson<BackendSession>(`/v1/session${addr}`)
    const session = mapSession(raw)

    if (this.address) {
      try {
        const integrationMembership = await getIntegrationJson<BackendMember | null>(
          `/api/integration/membership?address=${encodeURIComponent(this.address)}`,
        )
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
    const raw = await getJson<BackendSession['community']>('/v1/community')
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
    const raw = await getJson<any[]>('/v1/admin/events', {
      method: 'GET',
      headers: this.authHeaders(),
    })
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