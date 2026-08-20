/**
 * lib/api/mock/controls.ts
 *
 * Developer/test knobs for the mock API: simulated role-mutation failures,
 * simulated resource-fetch failures/delays, and the advertised API-contract
 * version override. Extracted from lib/api/mock.ts.
 */
import { ApiError } from '../errors'

/**
 * When true, the next assignRole()/removeRole() call throws a generic
 * (non-auth) failure instead of succeeding — issue #243. This exists
 * alongside NEXT_PUBLIC_MOCK_SESSION_STATE=expired rather than reusing it:
 * that flag is read once at module load and specifically simulates auth/
 * session state, whereas this is a runtime-togglable flag for exercising
 * the optimistic-update rollback path for an ordinary server error, from
 * either a test or the /developer dev-tools page. Reset by resetMockData().
 */
let mockRoleMutationShouldFail = false

/**
 * When set, the next getResource()/getPolicy() call(s) simulate an
 * operational failure instead of succeeding — used to verify loading and
 * error-boundary behaviour in mock mode without a real backend.
 * 'network' simulates a transport-level failure (fetch rejection);
 * 'server' simulates an HTTP 5xx. Reset by resetMockData().
 */
let mockResourceFetchFailure: 'network' | 'server' | false = false

/** Optional artificial delay (ms) applied before getResource()/getPolicy() resolve or fail. */
let mockResourceFetchDelayMs = 0

/**
 * Override the mock backend's advertised API contract version.
 * Set to `null` to restore the default (matches EXPECTED_API_VERSION).
 * When set, `getMeta()` returns this version, which can be used to
 * simulate an incompatible backend.
 */
export let MOCK_META_VERSION_OVERRIDE: string | null = null

export function getMockRoleMutationFailure(): boolean {
  return mockRoleMutationShouldFail
}

export function getMockResourceFetchFailure(): 'network' | 'server' | false {
  return mockResourceFetchFailure
}

export function getMockResourceFetchDelayMs(): number {
  return mockResourceFetchDelayMs
}

/**
 * Toggle a simulated non-auth failure for the next assignRole()/
 * removeRole() call(s). Mock-only — LiveAccessApi has no equivalent, and
 * this must never be called from application code, only from tests or the
 * /developer page.
 */
export function setMockRoleMutationFailure(shouldFail: boolean): void {
  mockRoleMutationShouldFail = shouldFail
}

/**
 * Toggle a simulated operational failure for getResource()/getPolicy().
 * Mock-only — LiveAccessApi has no equivalent. Intended for tests and the
 * /developer page, never application code.
 */
export function setMockResourceFetchFailure(mode: 'network' | 'server' | false): void {
  mockResourceFetchFailure = mode
}

/** Set an artificial delay (ms) before getResource()/getPolicy() settle. Pass 0 to disable. */
export function setMockResourceFetchDelay(ms: number): void {
  mockResourceFetchDelayMs = ms
}

/**
 * Set the mock backend's advertised API contract version. Pass `null` to
 * restore the default behaviour (matches the frontend's expected version).
 */
export function setMockMetaVersion(version: string | null): void {
  MOCK_META_VERSION_OVERRIDE = version
}

/** Build the simulated operational error used by getResource()/getPolicy(). */
export function mockResourceFetchError(): ApiError {
  return mockResourceFetchFailure === 'network'
    ? new ApiError({
        code: 'network_error',
        safeMessage: 'Unable to connect. Please check your connection and try again.',
        retryable: true,
      })
    : new ApiError({
        status: 500,
        code: 'server_error',
        safeMessage: 'The server could not complete the request. Please try again.',
        retryable: true,
      })
}

/** Throw a mock 500 ApiError — simulates an ordinary (non-auth) server failure. */
export function throwMockRoleMutationFailure(): never {
  throw new ApiError({
    status: 500,
    code: 'server_error',
    safeMessage: 'Simulated role mutation failure (mock mode).',
    retryable: true,
  })
}

/** Reset all fault-injection knobs to their defaults (called by resetMockData). */
export function resetMockControls(): void {
  mockRoleMutationShouldFail = false
  mockResourceFetchFailure = false
  mockResourceFetchDelayMs = 0
}