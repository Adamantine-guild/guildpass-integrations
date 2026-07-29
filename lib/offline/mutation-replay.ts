/**
 * lib/offline/mutation-replay.ts
 *
 * Drains lib/offline/mutation-queue.ts strictly FIFO, one mutation at a
 * time, awaiting each replay before starting the next. Framework-agnostic —
 * the caller (components/offline/mutation-queue-sync.tsx) supplies a way to
 * resolve an API client per community and is responsible for connectivity
 * detection (via lib/offline/use-sync-status.ts) and for rendering
 * PolicyConflictDialog on a 'conflict' outcome.
 *
 * Stops (without discarding anything) the moment a mutation can't be
 * resolved automatically:
 *  - an updatePolicy 409 surfaces as a 'conflict' outcome — never silently
 *    overwritten or discarded, exactly like a live conflict would be;
 *  - any other failure increments retryCount and surfaces as 'blocked'; the
 *    item stays at the head of the queue so later items don't jump ahead of
 *    it, preserving FIFO order. The caller is expected to try again on the
 *    next reconnect (or the next time it's invoked).
 *
 * Concurrency: guarded by a module-level flag so at most one drain runs at
 * a time no matter how many components call drainMutationQueue().
 */

import type { AccessPolicy, MutationResult, Role } from '../api/types'
import { isApiError } from '../api/errors'
import { buildPolicyConflictContext, type PolicyConflictContext } from '../api/policy-conflict'
import { mutationQueue, type QueuedMutation } from './mutation-queue'

/** The subset of AccessApi replay needs, scoped to one community. */
export interface MutationReplayApi {
  assignRole(address: string, role: Role): Promise<MutationResult>
  removeRole(address: string, role: Role): Promise<MutationResult>
  updatePolicy(policy: AccessPolicy): Promise<MutationResult>
  getPolicy(resourceId: string): Promise<AccessPolicy | null>
}

/** Resolves the API client to replay a given community's mutations against. */
export type ResolveReplayApi = (communitySlug: string) => MutationReplayApi

export type ReplayOutcome =
  | { kind: 'drained' }
  | { kind: 'conflict'; mutation: QueuedMutation; context: PolicyConflictContext }
  | { kind: 'blocked'; mutation: QueuedMutation; error: unknown }
  /** Another drain was already in progress — this call was a no-op. */
  | { kind: 'skipped' }

export interface DrainHooks {
  /** Called after each mutation is successfully replayed and removed from the queue. */
  onMutationSucceeded?: (mutation: QueuedMutation) => void
}

let isDraining = false
const replayListeners = new Set<() => void>()

function setDraining(value: boolean): void {
  isDraining = value
  replayListeners.forEach((listener) => listener())
}

/** Whether a drain is currently in progress, in this tab. Mirrors the
 *  get/subscribe shape of lib/api/backendStatus.ts's `backendOnline`. */
export function isReplayingMutationQueue(): boolean {
  return isDraining
}

export function subscribeMutationReplayState(listener: () => void): () => void {
  replayListeners.add(listener)
  return () => {
    replayListeners.delete(listener)
  }
}

function isConflictError(err: unknown): boolean {
  return isApiError(err) && err.status === 409
}

async function executeMutation(api: MutationReplayApi, mutation: QueuedMutation): Promise<void> {
  if (mutation.type === 'assignRole') {
    await api.assignRole(mutation.payload.address, mutation.payload.role)
    return
  }
  if (mutation.type === 'removeRole') {
    await api.removeRole(mutation.payload.address, mutation.payload.role)
    return
  }
  await api.updatePolicy(mutation.payload.policy)
}

export async function drainMutationQueue(
  resolveApi: ResolveReplayApi,
  hooks: DrainHooks = {},
): Promise<ReplayOutcome> {
  if (isDraining) return { kind: 'skipped' }
  setDraining(true)
  try {
    for (;;) {
      const next = await mutationQueue.peek()
      if (!next) return { kind: 'drained' }

      const api = resolveApi(next.communitySlug)

      try {
        await executeMutation(api, next)
        await mutationQueue.remove(next.id)
        hooks.onMutationSucceeded?.(next)
      } catch (err) {
        if (next.type === 'updatePolicy' && isConflictError(err)) {
          const context = await buildPolicyConflictContext(api, next.payload.policy)
          return { kind: 'conflict', mutation: next, context }
        }

        await mutationQueue.incrementRetryCount(next.id)
        return { kind: 'blocked', mutation: next, error: err }
      }
    }
  } finally {
    setDraining(false)
  }
}

/** Test-only: reset the module-level drain mutex between test cases. */
export function __resetMutationReplayStateForTests(): void {
  isDraining = false
  replayListeners.clear()
}
