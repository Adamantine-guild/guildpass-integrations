export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation_error'
  | 'rate_limited'
  | 'network_error'
  | 'server_error'
  | 'service_unavailable'
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
