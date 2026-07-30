import './setup-env'
import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { ApiError } from '../lib/api/errors'
import { mutationQueue } from '../lib/offline/mutation-queue'
import {
  drainMutationQueue,
  __resetMutationReplayStateForTests,
  type MutationReplayApi,
} from '../lib/offline/mutation-replay'
import type { AccessPolicy } from '../lib/api/types'

async function clearQueue(): Promise<void> {
  for (const mutation of await mutationQueue.list()) {
    await mutationQueue.remove(mutation.id)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('mutation replay (drain)', () => {
  beforeEach(async () => {
    await clearQueue()
    __resetMutationReplayStateForTests()
  })

  test('replays queued mutations in FIFO order, one at a time', async () => {
    const callOrder: string[] = []
    const concurrentDuringCall: number[] = []
    let inFlight = 0

    const api: MutationReplayApi = {
      async assignRole(address, role) {
        inFlight += 1
        concurrentDuringCall.push(inFlight)
        callOrder.push(`assignRole:${address}:${role}`)
        await sleep(5)
        inFlight -= 1
        return { status: 'executed' }
      },
      async removeRole(address, role) {
        inFlight += 1
        concurrentDuringCall.push(inFlight)
        callOrder.push(`removeRole:${address}:${role}`)
        await sleep(5)
        inFlight -= 1
        return { status: 'executed' }
      },
      async updatePolicy(policy) {
        inFlight += 1
        concurrentDuringCall.push(inFlight)
        callOrder.push(`updatePolicy:${policy.resourceId}`)
        await sleep(5)
        inFlight -= 1
        return { status: 'executed' }
      },
      async getPolicy() {
        return null
      },
    }

    await mutationQueue.enqueue('assignRole', { address: '0x1', role: 'member' }, 'demo')
    await mutationQueue.enqueue('removeRole', { address: '0x2', role: 'moderator' }, 'demo')
    await mutationQueue.enqueue('updatePolicy', { policy: { resourceId: 'alpha' } }, 'demo')

    const outcome = await drainMutationQueue(() => api)

    assert.deepEqual(callOrder, [
      'assignRole:0x1:member',
      'removeRole:0x2:moderator',
      'updatePolicy:alpha',
    ])
    // Never more than one mutation executing at a time.
    assert.deepEqual(concurrentDuringCall, [1, 1, 1])
    assert.equal(outcome.kind, 'drained')
    assert.equal(await mutationQueue.count(), 0)
  })

  test('a failure blocks the head of the queue — later items are not replayed out of order', async () => {
    const callOrder: string[] = []
    const api: MutationReplayApi = {
      async assignRole(address) {
        callOrder.push(`assignRole:${address}`)
        throw new ApiError({ code: 'server_error', safeMessage: 'boom', retryable: true })
      },
      async removeRole(address) {
        callOrder.push(`removeRole:${address}`)
        return { status: 'executed' }
      },
      async updatePolicy() {
        callOrder.push('updatePolicy')
        return { status: 'executed' }
      },
      async getPolicy() {
        return null
      },
    }

    const first = await mutationQueue.enqueue(
      'assignRole',
      { address: '0x1', role: 'member' },
      'demo',
    )
    await mutationQueue.enqueue('removeRole', { address: '0x2', role: 'moderator' }, 'demo')

    const outcome = await drainMutationQueue(() => api)

    // removeRole must never be attempted while assignRole is stuck at the head.
    assert.deepEqual(callOrder, ['assignRole:0x1'])
    assert.equal(outcome.kind, 'blocked')

    const remaining = await mutationQueue.list()
    assert.equal(remaining.length, 2)
    assert.equal(remaining[0].id, first.id)
    assert.equal(remaining[0].retryCount, 1)
  })

  test('a 409 on updatePolicy surfaces as a conflict and never discards the mutation', async () => {
    const attemptedPolicy: AccessPolicy = { resourceId: 'alpha', minTier: 'pro', updatedAt: 't1' }
    const currentPolicy: AccessPolicy = { resourceId: 'alpha', minTier: 'standard', updatedAt: 't2' }

    const api: MutationReplayApi = {
      async assignRole() {
        return { status: 'executed' }
      },
      async removeRole() {
        return { status: 'executed' }
      },
      async updatePolicy() {
        throw new ApiError({ status: 409, code: 'conflict', safeMessage: 'conflict' })
      },
      async getPolicy() {
        return currentPolicy
      },
    }

    await mutationQueue.enqueue('updatePolicy', { policy: attemptedPolicy }, 'demo')

    const outcome = await drainMutationQueue(() => api)

    assert.equal(outcome.kind, 'conflict')
    if (outcome.kind === 'conflict') {
      assert.deepEqual(outcome.context.attemptedPolicy, attemptedPolicy)
      assert.deepEqual(outcome.context.currentPolicy, currentPolicy)
    }

    // Never silently discarded or overwritten — still queued for the admin.
    assert.equal(await mutationQueue.count(), 1)
  })

  test('prevents concurrent drains — a second call while one is in flight is a no-op', async () => {
    let callCount = 0
    const api: MutationReplayApi = {
      async assignRole() {
        callCount += 1
        await sleep(20)
        return { status: 'executed' }
      },
      async removeRole() {
        return { status: 'executed' }
      },
      async updatePolicy() {
        return { status: 'executed' }
      },
      async getPolicy() {
        return null
      },
    }

    await mutationQueue.enqueue('assignRole', { address: '0x1', role: 'member' }, 'demo')

    // Deliberately not awaited — drainMutationQueue sets its mutex flag
    // synchronously before its first `await`, so the second call below is
    // guaranteed to observe "already draining" without needing a timer.
    const firstDrain = drainMutationQueue(() => api)
    const secondOutcome = await drainMutationQueue(() => api)

    assert.equal(secondOutcome.kind, 'skipped')

    const firstOutcome = await firstDrain
    assert.equal(firstOutcome.kind, 'drained')
    assert.equal(callCount, 1)
  })
})
