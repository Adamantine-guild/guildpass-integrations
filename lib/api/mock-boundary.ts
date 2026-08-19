import type { AccessApi } from './types'
import { MockAccessApi } from './mock'

/**
 * Stable application-facing boundary for mock-only controls.
 *
 * Keep this list deliberately small. Application code should import these
 * symbols from `@/lib/api`; tests of the mock implementation may continue to
 * import `./mock` directly.
 */
export {
  applyMockScenario,
  replayMockEvent,
  resetMockData,
  setMockMetaVersion,
  setMockRoleMutationFailure,
} from './mock'

/** Creates the mock client without exposing its concrete implementation. */
export function createMockAccessApi(address?: string, communityId?: string): AccessApi {
  return new MockAccessApi(address, communityId)
}
