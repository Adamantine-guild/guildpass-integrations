import { config } from '../config'
import { LiveAccessApi } from './live'
import {
  MockAccessApi,
  resetMockData,
  applyMockScenario,
  replayMockEvent,
  setMockRoleMutationFailure,
  setMockMetaVersion,
} from './mock'
import { AccessApi } from './types'
import type { VersionCompatibility } from './version'

export { checkVersionCompatibility } from './version'
export type { VersionCompatibility }

/**
 * Returns the appropriate API client based on the environment.
 *
 * @param address     Connected wallet address (used for session/membership queries)
 * @param token       SIWE session token — pass this to authenticate admin mutations.
 *                    Ignored by the mock client (mutations succeed unconditionally in mock mode).
 * @param communityId Scoped community ID or slug
 */
export function getApi(address?: string, token?: string, communityId?: string): AccessApi {
  if (config.apiMode === 'mock') return new MockAccessApi(address, communityId)
  const api = new LiveAccessApi(address, token, communityId)
  // Kick off the startup version compatibility check. It resolves in the
  // background; callers can await api.checkVersion() for the result.
  api.checkVersion()
  return api
}

export * from './types'
export * from './mappers'
export { resetMockData, applyMockScenario, replayMockEvent, setMockRoleMutationFailure, setMockMetaVersion } from './mock'
