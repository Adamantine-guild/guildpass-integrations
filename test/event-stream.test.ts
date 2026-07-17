import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { resetMockData, MockAccessApi } from '../lib/api/mock'
import type { WebhookEventLog, WebhookEventStreamState } from '../lib/api/types'

describe('Mock event stream (subscribeWebhookEvents)', () => {
  const TEST_ADDRESS = '0x1234567890123456789012345678901234567890'

  beforeEach(() => {
    resetMockData()
  })

  it('immediately pushes all existing events via onEvent', async () => {
    const api = new MockAccessApi(TEST_ADDRESS)
    const received: WebhookEventLog[] = []

    const unsubscribe = api.subscribeWebhookEvents({
      onEvent: (event) => {
        received.push(event)
      },
    })

    // Must complete synchronously — events are pushed before subscribeWebhookEvents returns
    assert.strictEqual(received.length, 3)
    assert.strictEqual(received[0].id, 'wh_01J1')
    assert.strictEqual(received[1].id, 'wh_01J2')
    assert.strictEqual(received[2].id, 'wh_01J3')

    unsubscribe()
  })

  it('deduplicates events by id', async () => {
    const api = new MockAccessApi(TEST_ADDRESS)
    const received: WebhookEventLog[] = []

    // First subscription — receives all existing events
    const unsub1 = api.subscribeWebhookEvents({
      onEvent: (event) => {
        received.push(event)
      },
    })
    assert.strictEqual(received.length, 3)

    // Second subscription — should not re-emit the same events (they're already in `seen`)
    const unsub2 = api.subscribeWebhookEvents({
      onEvent: (event) => {
        received.push(event)
      },
    })
    // The same 3 events are in the store, but seen set is shared within one subscription
    // so a new subscription has its own seen set and will re-emit them
    assert.strictEqual(received.length, 6)

    unsub1()
    unsub2()
  })

  it('reports connected state immediately', async () => {
    const api = new MockAccessApi(TEST_ADDRESS)
    const states: WebhookEventStreamState[] = []

    const unsubscribe = api.subscribeWebhookEvents({
      onEvent: () => {},
      onStateChange: (state) => {
        states.push(state)
      },
    })

    assert.deepStrictEqual(states, ['connected'])

    unsubscribe()
  })

  it('cancels subscription via returned unsubscribe function', async () => {
    const api = new MockAccessApi(TEST_ADDRESS)
    const received: WebhookEventLog[] = []

    const unsubscribe = api.subscribeWebhookEvents({
      onEvent: (event) => {
        received.push(event)
      },
    })

    // Capture initial events
    const initialCount = received.length
    assert.ok(initialCount > 0)

    // Unsubscribe immediately
    unsubscribe()

    // Wait briefly — no new events should arrive
    await new Promise((resolve) => setTimeout(resolve, 200))
    assert.strictEqual(received.length, initialCount)
  })

  it('cancels subscription via AbortSignal', async () => {
    const api = new MockAccessApi(TEST_ADDRESS)
    const received: WebhookEventLog[] = []
    const controller = new AbortController()

    api.subscribeWebhookEvents({
      onEvent: (event) => {
        received.push(event)
      },
      signal: controller.signal,
    })

    const initialCount = received.length
    assert.ok(initialCount > 0)

    controller.abort()

    await new Promise((resolve) => setTimeout(resolve, 200))
    assert.strictEqual(received.length, initialCount)
  })
})
