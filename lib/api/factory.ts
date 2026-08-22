/**
 * lib/api/factory.ts — narrow entry-point for `getApi`.
 *
 * This module exposes only the `getApi` factory so that components that
 * need to call API methods do not transitively import the full barrel
 * (`lib/api/index.ts`) with its mock-utility re-exports
 * (`resetMockData`, `applyMockScenario`, etc.).
 *
 * Usage:
 *   import { getApi } from '@/lib/api/factory'
 *
 * The full barrel (`@/lib/api`) re-exports `getApi` from here, so
 * existing consumers are unaffected.
 */

import { config } from '../config'
import { LiveAccessApi } from './live'
import { createMockAccessApi } from './mock-boundary'
import type { AccessApi } from './types'

export { checkVersionCompatibility } from './version'
export type { VersionCompatibility } from './version'

/**
 * Returns the appropriate API client based on the environment.
 *
 * @param address     Connected wallet address (used for session/membership queries)
 * @param token       SIWE session token — pass this to authenticate admin mutations.
 *                    Ignored by the mock client (mutations succeed unconditionally in mock mode).
 * @param communityId Scoped community ID or slug
 */
export function getApi(address?: string, token?: string, communityId?: string): AccessApi {
  if (config.apiMode === 'mock') return createMockAccessApi(address, communityId)
  const api = new LiveAccessApi(address, token, communityId)
  // Kick off the startup version compatibility check. It resolves in the
  // background; callers can await api.checkVersion() for the result.
  api.checkVersion()
  return api
}
