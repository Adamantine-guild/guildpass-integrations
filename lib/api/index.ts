import { config } from '../config'
import { LiveAccessApi } from './live'
import { MockAccessApi, resetMockData, applyMockScenario, replayMockEvent } from './mock'
import { AccessApi } from './types'

/**
 * Returns the appropriate API client based on the environment.
 *
 * @param address  Connected wallet address (used for session/membership queries)
 * @param token    SIWE session token — pass this to authenticate admin mutations.
 *                 Ignored by the mock client (mutations succeed unconditionally in mock mode).
 */
export function getApi(address?: string, token?: string): AccessApi {
  if (config.apiMode === 'mock') return new MockAccessApi(address)
  return new LiveAccessApi(address, token)
}

export * from './types'
export * from './mappers'
export { resetMockData, applyMockScenario, replayMockEvent }
