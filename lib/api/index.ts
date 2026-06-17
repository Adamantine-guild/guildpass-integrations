import { LiveAccessApi } from './live'
import { MockAccessApi } from './mock'
import { AccessApi } from './types'

/**
 * Returns the appropriate API client based on the environment.
 *
 * @param address  Connected wallet address (used for session/membership queries)
 * @param token    SIWE session token — pass this to authenticate admin mutations.
 *                 Ignored by the mock client (mutations succeed unconditionally in mock mode).
 */
export function getApi(address?: string, token?: string): AccessApi {
  const mock =
    process.env.NEXT_PUBLIC_MOCK_MODE === 'true' ||
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
  if (mock) return new MockAccessApi(address)
  return new LiveAccessApi(address, token)
}

export * from './types'
