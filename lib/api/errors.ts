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
  | 'aborted';

export interface ApiErrorOptions {
  status?: number;
  code: ApiErrorCode;
  safeMessage: string;
  path?: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly status?: number;
  readonly code: ApiErrorCode;
  readonly safeMessage: string;
  readonly path?: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor({
    status,
    code,
    safeMessage,
    path,
    retryable = false,
    details,
    cause,
  }: ApiErrorOptions) {
    super(safeMessage);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.safeMessage = safeMessage;
    this.path = path;
    this.retryable = retryable;
    this.details = details;

    if (cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

/**
 * Represents an offline or degraded‑mode error. It is a specific kind of
 * `ApiError` with the code `service_unavailable` and is not retryable. UI
 * components can catch this type to display an offline banner.
 */
export class OfflineError extends ApiError {
  constructor(message = 'The application is offline. Showing cached data.') {
    super({
      status: 503,
      code: 'service_unavailable',
      safeMessage: message,
      retryable: false,
    });
    this.name = 'OfflineError';
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
