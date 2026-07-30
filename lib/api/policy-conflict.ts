/**
 * lib/api/policy-conflict.ts
 *
 * Shared helper for building the context PolicyConflictDialog needs after a
 * 409 on updatePolicy: the policy the caller attempted to save, plus a
 * best-effort fetch of the server's current version for the diff view.
 *
 * Used by both the live edit flow
 * (app/[communitySlug]/admin/policies/page.tsx) and the offline replay
 * engine (lib/offline/mutation-replay.ts via components/offline/mutation-queue-sync.tsx)
 * so the "what do we show in the conflict dialog" logic exists in exactly
 * one place.
 */

import type { AccessApi, AccessPolicy } from './types'

export interface PolicyConflictContext {
  attemptedPolicy: AccessPolicy
  currentPolicy?: AccessPolicy
}

export async function buildPolicyConflictContext(
  api: Pick<AccessApi, 'getPolicy'>,
  attemptedPolicy: AccessPolicy,
): Promise<PolicyConflictContext> {
  try {
    const currentPolicy = await api.getPolicy(attemptedPolicy.resourceId)
    return { attemptedPolicy, currentPolicy: currentPolicy ?? undefined }
  } catch {
    // If we can't fetch the current policy, still surface the dialog —
    // the admin needs to know a conflict happened even without a diff.
    return { attemptedPolicy }
  }
}
