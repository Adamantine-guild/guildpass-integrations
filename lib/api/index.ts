// Re-export getApi and version helpers from the narrow factory module so that
// existing consumers of `@/lib/api` continue to work unchanged.
export { getApi, checkVersionCompatibility } from './factory'
export type { VersionCompatibility } from './factory'

export * from './types'
export * from './mappers'
export {
  resetMockData,
  applyMockScenario,
  replayMockEvent,
  setMockRoleMutationFailure,
  setMockMetaVersion,
} from './mock-boundary'
export {
  ApiError,
  AuthError,
  NetworkError,
  OfflineError,
  isApiError,
  isAuthError,
  isNetworkError,
  categorizeError,
  type ErrorCategory,
  type ApiErrorCode,
  type ApiErrorOptions,
} from './errors'
