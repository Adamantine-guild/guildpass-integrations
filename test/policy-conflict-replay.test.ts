import './setup-env'
import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { MockAccessApi, resetMockData } from '../lib/api/mock'
import { withOfflineMutationQueue } from '../lib/api/offline-mutations'
import { mutationQueue } from '../lib/offline/mutation-queue'
import { drainMutationQueue, __resetMutationReplayStateForTests } from '../lib/offline/mutation-replay'
import { NetworkError } from '../lib/api/errors'
import type { AccessApi, AccessPolicy } from '../lib/api/types'

async function clearQueue(): Promise<void> {
  for (const mutation of await mutationQueue.list()) {
    await mutationQueue.remove(mutation.id)
  }
}

describe('offline policy conflict replay (end-to-end)', () => {
  beforeEach(async () => {
    await resetMockData()
    await clearQueue()
    __resetMutationReplayStateForTests()
  })

  test('offline -> queued -> reconnect -> 409 -> conflict, preserving attempted vs. current context', async () => {
    const communitySlug = 'guildpass-demo'
    const api = new MockAccessApi('0xadmin', communitySlug)

    // Baseline: create the policy so there's a real updatedAt to version
    // against (mirrors docs/POLICY_CONCURRENCY.md's optimistic-concurrency
    // scheme — updatedAt IS the version token).
    await api.updatePolicy({ resourceId: 'alpha', minTier: 'standard' })
    const loaded = await api.getPolicy('alpha')
    assert.ok(loaded?.updatedAt)

    // The admin's attempted change, built from the version they had loaded
    // before going offline.
    const attemptedPolicy: AccessPolicy = {
      resourceId: 'alpha',
      minTier: 'pro',
      updatedAt: loaded!.updatedAt,
    }

    // 1. OFFLINE — the network call fails; withOfflineMutationQueue queues
    // the mutation instead of throwing.
    const offlineApi = {
      updatePolicy: async () => {
        throw new NetworkError()
      },
    } as unknown as AccessApi
    const result = await withOfflineMutationQueue(offlineApi, communitySlug).updatePolicy(
      attemptedPolicy,
    )
    assert.equal(result.status, 'queued')
    assert.equal(await mutationQueue.count(), 1)

    // 2. While offline, another admin changes the policy — the server's
    // updatedAt moves on without our queued edit knowing about it.
    await api.updatePolicy({ resourceId: 'alpha', minTier: 'standard' })
    const serverNow = await api.getPolicy('alpha')
    assert.notEqual(serverNow?.updatedAt, attemptedPolicy.updatedAt)

    // 3. RECONNECT — replay against the real API. The stale updatedAt in
    // our queued mutation no longer matches the server's, so it 409s.
    const outcome = await drainMutationQueue(() => api)

    assert.equal(outcome.kind, 'conflict')
    if (outcome.kind === 'conflict') {
      // PolicyConflictDialog must be able to show exactly what the admin
      // tried to save...
      assert.deepEqual(outcome.context.attemptedPolicy, attemptedPolicy)
      // ...compared against exactly what's actually on the server now.
      assert.deepEqual(outcome.context.currentPolicy, serverNow)
    }

    // Never silently applied or dropped — stays queued until the admin
    // resolves it via the conflict dialog.
    assert.equal(await mutationQueue.count(), 1)
  })
})
