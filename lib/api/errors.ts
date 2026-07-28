export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation_error'
  | 'rate_limited'
  | 'network_error'
  | 'server_error'
  | 'bad_request'
  | 'unknown_error'

export interface ApiErrorOptions {
  status?: number
  code: ApiErrorCode
  safeMessage: string
  path?: string
  retryable?: boolean
  details?: Record<string, unknown>
  cause?: unknown
}

export class ApiError extends Error {
  readonly status?: number
  readonly code: ApiErrorCode
  readonly safeMessage: string
  readonly path?: string
  readonly retryable: boolean
  readonly details?: Record<string, unknown>

  constructor({
    status,
    code,
    safeMessage,
    path,
    retryable = false,
    details,
    cause,
  }: ApiErrorOptions) {
    super(safeMessage)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.safeMessage = safeMessage
    this.path = path
    this.retryable = retryable
    this.details = details

    if (cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = cause
    }
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError
}

// ── Specialised error subclasses ──────────────────────────────────────────────

/**
 * Error originating from a failed network request (fetch threw, not a HTTP status).
 * Always retryable.
 */
export class NetworkError extends ApiError {
  constructor(opts?: { safeMessage?: string; path?: string; cause?: unknown }) {
    super({
      code: 'network_error',
      safeMessage: opts?.safeMessage ?? 'Unable to connect. Please check your connection and try again.',
      path: opts?.path,
      retryable: true,
      cause: opts?.cause,
    })
    this.name = 'NetworkError'
  }
}

export function isNetworkError(err: unknown): err is NetworkError {
  return err instanceof NetworkError
}

/**
 * Error originating from an authentication or authorisation failure (401 / 403).
 * Not retryable via simple retry — user action (re-sign / re-auth) is needed.
 */
export class AuthError extends ApiError {
  constructor(opts: {
    status?: number
    code?: 'unauthorized' | 'forbidden'
    safeMessage?: string
    path?: string
    details?: Record<string, unknown>
  }) {
    super({
      status: opts.status ?? 401,
      code: opts.code ?? 'unauthorized',
      safeMessage: opts.safeMessage ?? 'Session expired. Please sign in again.',
      path: opts.path,
      retryable: false,
      details: opts.details,
    })
    this.name = 'AuthError'
  }
}

export function isAuthError(err: unknown): err is AuthError {
  return err instanceof AuthError
}

// ── Error categories for use in error boundaries ─────────────────────────────

export type ErrorCategory = 'network' | 'auth' | 'validation' | 'unknown'

/**
 * Returns a high-level category for any error value, so error boundaries can
 * branch on the kind of failure rather than inspecting raw error classes.
 */
export function categorizeError(err: unknown): ErrorCategory {
  if (isNetworkError(err)) return 'network'
  if (isAuthError(err)) return 'auth'
  if (isApiError(err)) {
    // Non-auth ApiError: branch by code
    switch (err.code) {
      case 'unauthorized':
      case 'forbidden':
        return 'auth'
      case 'validation_error':
      case 'bad_request':
        return 'validation'
      default:
        return 'unknown'
    }
  }
  // Generic JS errors (TypeError, etc.) are treated as unknown
  return 'unknown'
}
