import './setup-env'
import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  createInMemoryQueueStorage,
  createMutationQueue,
  type QueuedMutation,
} from '../lib/offline/mutation-queue'

describe('mutation queue', () => {
  test('enqueue persists a mutation with id, queuedAt, and retryCount 0', async () => {
    const queue = createMutationQueue(createInMemoryQueueStorage())

    const mutation = await queue.enqueue(
      'assignRole',
      { address: '0xabc', role: 'moderator' },
      'guildpass-demo',
    )

    assert.ok(mutation.id)
    assert.ok(mutation.queuedAt)
    assert.equal(mutation.retryCount, 0)
    assert.equal(mutation.type, 'assignRole')
    assert.deepEqual(mutation.payload, { address: '0xabc', role: 'moderator' })
    assert.equal(mutation.communitySlug, 'guildpass-demo')

    assert.equal(await queue.count(), 1)
  })

  test('lists queued mutations in FIFO (oldest-first) order', async () => {
    const queue = createMutationQueue(createInMemoryQueueStorage())

    const first = await queue.enqueue('assignRole', { address: '0x1', role: 'member' }, 'demo')
    const second = await queue.enqueue('removeRole', { address: '0x2', role: 'admin' }, 'demo')
    const third = await queue.enqueue(
      'updatePolicy',
      { policy: { resourceId: 'alpha' } },
      'demo',
    )

    const all = await queue.list()
    assert.deepEqual(
      all.map((m) => m.id),
      [first.id, second.id, third.id],
    )

    const oldest = await queue.peek()
    assert.equal(oldest?.id, first.id)
  })

  test('dequeue (remove) drops a mutation and advances the head of the queue', async () => {
    const queue = createMutationQueue(createInMemoryQueueStorage())

    const first = await queue.enqueue('assignRole', { address: '0x1', role: 'member' }, 'demo')
    const second = await queue.enqueue('removeRole', { address: '0x2', role: 'admin' }, 'demo')

    await queue.remove(first.id)

    assert.equal(await queue.count(), 1)
    const remaining = await queue.peek()
    assert.equal(remaining?.id, second.id)
  })

  test('incrementRetryCount bumps retryCount and returns null for an unknown id', async () => {
    const queue = createMutationQueue(createInMemoryQueueStorage())
    const mutation = await queue.enqueue('assignRole', { address: '0x1', role: 'member' }, 'demo')

    const once = await queue.incrementRetryCount(mutation.id)
    assert.equal(once?.retryCount, 1)

    const twice = await queue.incrementRetryCount(mutation.id)
    assert.equal(twice?.retryCount, 2)

    const missing = await queue.incrementRetryCount('does-not-exist')
    assert.equal(missing, null)
  })

  test('survives a simulated page reload — a fresh queue instance over the same backing store sees prior entries', async () => {
    const backingStore = new Map<string, QueuedMutation>()

    const beforeReload = createMutationQueue(createInMemoryQueueStorage(backingStore))
    await beforeReload.enqueue('assignRole', { address: '0xabc', role: 'admin' }, 'demo')
    await beforeReload.enqueue('removeRole', { address: '0xdef', role: 'moderator' }, 'demo')

    // Simulate a full page reload: a brand new queue object, constructed
    // fresh, over the same durable backing store (IndexedDB in the browser;
    // the same Map here stands in for "whatever survived the reload").
    const afterReload = createMutationQueue(createInMemoryQueueStorage(backingStore))

    const restored = await afterReload.list()
    assert.equal(restored.length, 2)
    const [firstEntry, secondEntry] = restored
    assert.equal(firstEntry.type, 'assignRole')
    assert.equal(secondEntry.type, 'removeRole')
    if (firstEntry.type !== 'assignRole' || secondEntry.type !== 'removeRole') {
      throw new Error('unexpected mutation type after reload')
    }
    assert.equal(firstEntry.payload.address, '0xabc')
    assert.equal(secondEntry.payload.address, '0xdef')
  })

  test('subscribe notifies on enqueue and remove', async () => {
    const queue = createMutationQueue(createInMemoryQueueStorage())
    let notifications = 0
    const unsubscribe = queue.subscribe(() => {
      notifications += 1
    })

    const mutation = await queue.enqueue('assignRole', { address: '0x1', role: 'member' }, 'demo')
    assert.equal(notifications, 1)

    await queue.remove(mutation.id)
    assert.equal(notifications, 2)

    unsubscribe()
    await queue.enqueue('assignRole', { address: '0x2', role: 'member' }, 'demo')
    assert.equal(notifications, 2)
  })
})
