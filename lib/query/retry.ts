import { ApiError, isApiError } from '../api/errors'

/**
 * React Query retry callback that respects the `retryable` flag on ApiError.
 *
 * - ApiError with retryable=false → never retry
 * - ApiError with retryable=true  → retry up to `maxRetries` (default: 2)
 * - Non-ApiError (unexpected)     → retry up to `maxRetries`
 */
export function retryOnApiError(maxRetries = 2) {
  return (failureCount: number, error: unknown): boolean => {
    if (isApiError(error) && !error.retryable) return false
    return failureCount < maxRetries
  }
}
