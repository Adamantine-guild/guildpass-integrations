/**
 * lib/api/offline-mutations.ts
 *
 * Thin wrapper around an {@link AccessApi} client that makes
 * assignRole/removeRole/updatePolicy durable-offline instead of failing.
 *
 * Deliberately NOT baked into LiveAccessApi/MockAccessApi themselves: both
 * clients already implement the full AccessApi contract and are exercised
 * directly by a lot of existing tests, so wrapping at the call site (where
 * admin pages construct their client) keeps this feature additive and
 * avoids touching either implementation. Every method other than the three
 * mutations below passes straight through to the wrapped client.
 */

import type { AccessApi, AccessPolicy, MutationResult, Role } from './types'
import { isNetworkError, OfflineError } from './errors'
import {
  mutationQueue,
  type PayloadFor,
  type QueuedMutationType,
} from '../offline/mutation-queue'

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * True for the two offline signals this wrapper queues on: the browser had
 * no connection when the request was attempted (isOffline(), checked by the
 * caller before even trying), or the fetch itself failed at the transport
 * level. Deliberately narrow — HTTP error responses (4xx/5xx, including the
 * 409 conflict / 401 auth-expired paths) are real server answers, not
 * connectivity failures, and must keep surfacing to the existing
 * error-handling flows (PolicyConflictDialog, registerPendingRetry) instead
 * of being silently queued.
 */
function isOfflineFailure(err: unknown): boolean {
  return isNetworkError(err) || err instanceof OfflineError
}

async function queueOrCall<T extends QueuedMutationType>(
  type: T,
  payload: PayloadFor<T>,
  communitySlug: string,
  call: () => Promise<MutationResult>,
): Promise<MutationResult> {
  if (isOffline()) {
    await mutationQueue.enqueue(type, payload, communitySlug)
    return { status: 'queued' }
  }
  try {
    return await call()
  } catch (err) {
    if (isOfflineFailure(err)) {
      await mutationQueue.enqueue(type, payload, communitySlug)
      return { status: 'queued' }
    }
    throw err
  }
}

/**
 * Wraps `api` so assignRole/removeRole/updatePolicy enqueue themselves
 * (see lib/offline/mutation-queue.ts) instead of throwing whenever the
 * browser is offline or the request fails with a network error, and return
 * `{ status: 'queued' }` instead. `communitySlug` is captured on the queued
 * record so replay later targets the right community regardless of which
 * route is active when it runs (components/offline/mutation-queue-sync.tsx).
 */
export function withOfflineMutationQueue(api: AccessApi, communitySlug: string): AccessApi {
  const queueingAssignRole = (address: string, role: Role) =>
    queueOrCall('assignRole', { address, role }, communitySlug, () =>
      api.assignRole(address, role),
    )

  const queueingRemoveRole = (address: string, role: Role) =>
    queueOrCall('removeRole', { address, role }, communitySlug, () =>
      api.removeRole(address, role),
    )

  const queueingUpdatePolicy = (policy: AccessPolicy) =>
    queueOrCall('updatePolicy', { policy }, communitySlug, () => api.updatePolicy(policy))

  return new Proxy(api, {
    get(target, prop, receiver) {
      if (prop === 'assignRole') return queueingAssignRole
      if (prop === 'removeRole') return queueingRemoveRole
      if (prop === 'updatePolicy') return queueingUpdatePolicy
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as AccessApi
}
