import { config } from '../config'
import { MockBillingApi } from './mock'
import { BillingApi } from './types'

/**
 * Returns the appropriate Billing API client based on the environment.
 *
 * @param address     Connected wallet address (used for billing state queries)
 * @param token       SIWE session token — pass this to authenticate mutations if needed.
 * @param communityId Scoped community ID or slug
 */
export function getBillingApi(address?: string, token?: string, communityId?: string): BillingApi {
  // Currently, we only target the mock provider as live integrations are out of scope.
  // When adding support for a live billing client (e.g. Stripe, Paddle), branch here based on environment:
  // if (config.apiMode === 'live') return new LiveBillingApi(address, token, communityId)
  return new MockBillingApi(address, communityId)
}

export * from './types'
