/**
 * test/webhook-stream-reconnect.test.ts
 *
 * Tests for the SSE reconnect-with-backoff logic in subscribeWebhookEvents.
 *
 * Covers:
 *  - Healthy stream: no reconnection needed
 *  - Dropped stream (reader done) triggers reconnect after backoff
 *  - Stream that never opens (HTTP error) triggers reconnect after backoff
 *  - Unsubscribe stops all further reconnect attempts
 *  - Backoff delay grows on consecutive failures
 *  - onError is still invoked so polling fallback works
 *  - onReconnecting callback fires with attempt number and delay
 *
 * NOTE: These tests use real timers (no mock.timers) because the reconnect
 * backoff uses setTimeout inside a Promise constructor, which doesn't compose
 * well with mock.timers. We use very small env values to keep tests fast.
 */

import './setup-alias'
import { describe, it, beforeEach, afterEach, after, mock } from 'node:test'
import * as assert from 'node:assert/strict'
import { LiveAccessApi } from '../lib/api/live'
import type { WebhookEventLog } from '../lib/api/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for N ms using real timer. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Create a minimal SSE data frame that looks like a WebhookEventLog. */
function sseFrame(eventId: string): string {
  return `data: ${JSON.stringify({
    id: eventId,
    eventType: 'policy.updated',
    timestamp: new Date().toISOString(),
    affectedIdentifier: 'test-resource',
    payloadSummary: { network: 'test' },
    status: 'success',
  })}\n\n`
}

// ---------------------------------------------------------------------------
// Mock reader & response helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock ReadableStream whose `getReader()` returns a controlled reader.
 * The reader delivers the given results in sequence, then either
 * repeats the last result (default) or stays pending forever (holdAfterLast).
 */
function mockBodyStream(
  results: Array<{ done: boolean; value?: string }>,
  holdAfterLast = false,
): ReadableStream<Uint8Array> {
  let idx = 0
  const encoder = new TextEncoder()
  const actualResults = results.map((r) => ({
    done: r.done,
    value: r.value ? encoder.encode(r.value) : undefined,
  }))

  const reader: ReadableStreamDefaultReader<Uint8Array> = {
    read() {
      if (idx < actualResults.length) {
        return Promise.resolve(actualResults[idx++] as { done: boolean; value?: Uint8Array })
      }
      if (holdAfterLast) {
        return new Promise<{ done: boolean; value?: Uint8Array }>(() => {
          /* never resolves */
        })
      }
      return Promise.resolve(actualResults[actualResults.length - 1]!)
    },
    cancel() {
      return Promise.resolve()
    },
    releaseLock() {
      /* no-op */
    },
    closed: Promise.resolve(undefined),
  } as unknown as ReadableStreamDefaultReader<Uint8Array>

  return { getReader() { return reader } } as unknown as ReadableStream<Uint8Array>
}

/**
 * Create a mock fetch response that returns an SSE stream.
 */
function okStreamResponse(body: ReadableStream<Uint8Array>): Response {
  return {
    ok: true,
    status: 200,
    body,
    headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    statusText: 'OK',
    type: 'basic' as const,
    url: '',
    redirected: false,
    bodyUsed: false,
    clone: () => {
      throw new Error('not implemented')
    },
  } as unknown as Response
}

/**
 * Create a mock fetch response that represents an HTTP error.
 */
function errorResponse(status: number): Response {
  return {
    ok: false,
    status,
    body: null,
    headers: new Headers(),
    statusText: status >= 500 ? 'Server Error' : 'Bad Request',
    type: 'basic' as const,
    url: '',
    redirected: false,
    bodyUsed: false,
    json: async () => undefined,
    text: async () => '',
    clone: () => {
      throw new Error('not implemented')
    },
  } as unknown as Response
}

// ---------------------------------------------------------------------------
// Env & state
// ---------------------------------------------------------------------------

const originalEnv = { ...process.env }
let origFetch: typeof globalThis.fetch
let origRandom: typeof Math.random

beforeEach(() => {
  // Use tiny backoff values so reconnect tests are fast with real timers
  process.env.NEXT_PUBLIC_SSE_RECONNECT_MAX_ATTEMPTS = '3'
  process.env.NEXT_PUBLIC_SSE_RECONNECT_BASE_DELAY_MS = '5'
  process.env.NEXT_PUBLIC_SSE_RECONNECT_MAX_DELAY_MS = '50'
  process.env.NEXT_PUBLIC_SSE_STABILITY_WINDOW_MS = '30000'

  origFetch = globalThis.fetch
  origRandom = Math.random
  Math.random = () => 0
})

afterEach(() => {
  globalThis.fetch = origFetch
  Math.random = origRandom
})

after(() => {
  process.env = originalEnv
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('subscribeWebhookEvents — SSE stream reconnect', () => {
  it('emits events from a healthy stream without reconnecting', async () => {
    const fetchMock = mock.fn<(typeof globalThis)['fetch']>()
    globalThis.fetch = fetchMock
    fetchMock.mock.mockImplementation(async () =>
      okStreamResponse(
        mockBodyStream([{ done: false, value: sseFrame('evt-1') }], true),
      ),
    )

    const api = new LiveAccessApi('0xaddr', 'test-token', 'test-community')
    const received: WebhookEventLog[] = []

    const unsubscribe = api.subscribeWebhookEvents(
      (event) => received.push(event),
      () => {
        assert.fail('onError should not be called for a healthy stream')
      },
    )

    // Wait for the fetch to resolve and the stream to deliver the first frame
    await sleep(10)

    assert.equal(received.length, 1, 'should have received one event')
    assert.equal(received[0]!.id, 'evt-1')
    assert.equal(fetchMock.mock?.callCount?.() ?? 1, 1)

    unsubscribe()
  })

  it('reconnects after a stream drops mid-read (reader done)', async () => {
    let fetchCalls = 0
    globalThis.fetch = async () => {
      fetchCalls++
      const chunk = sseFrame(`evt-${fetchCalls}`)
      return okStreamResponse(
        mockBodyStream([
          { done: false, value: chunk },
          { done: true },
        ]),
      )
    }

    const api = new LiveAccessApi('0xaddr', 'test-token', 'test-community')
    const received: WebhookEventLog[] = []
    let errorCount = 0
    const reconnectingCalls: Array<{ attempt: number; delayMs: number }> = []

    const unsubscribe = api.subscribeWebhookEvents(
      (event) => received.push(event),
      () => {
        errorCount++
      },
      (attempt, delayMs) => {
        reconnectingCalls.push({ attempt, delayMs })
      },
    )

    // First fetch attempt: gets one frame, stream closes, triggers reconnect
    await sleep(10)
    assert.equal(received.length, 1, 'should have received first event')
    assert.equal(received[0]!.id, 'evt-1')
    assert.equal(fetchCalls, 1, 'first fetch call made')
    assert.equal(errorCount, 1, 'onError called once for first drop')

    // Wait for reconnect backoff (attempt 1: base=5ms * 2^0 = 5ms, jitter=0)
    await sleep(15)
    assert.equal(fetchCalls, 2, 'second fetch call made after reconnect')
    assert.equal(received.length, 2, 'should have received second event')
    assert.equal(received[1]!.id, 'evt-2')

    // Wait for reconnect backoff (attempt 2: base=5ms * 2^1 = 10ms, jitter=0)
    await sleep(20)
    assert.equal(fetchCalls, 3, 'third fetch call made after second reconnect')
    assert.equal(received.length, 3, 'should have received third event')
    assert.equal(received[2]!.id, 'evt-3')
    assert.equal(errorCount, 2, 'onError called twice')

    assert.equal(reconnectingCalls.length, 2, 'onReconnecting called twice')
    assert.equal(reconnectingCalls[0]!.attempt, 1, 'first reconnect attempt is 1')
    assert.equal(reconnectingCalls[0]!.delayMs, 5, 'first backoff is 5ms')
    assert.equal(reconnectingCalls[1]!.attempt, 2, 'second reconnect attempt is 2')
    assert.equal(reconnectingCalls[1]!.delayMs, 10, 'second backoff is 10ms')

    unsubscribe()
  })

  it('reconnects after an HTTP error (server error)', async () => {
    let callCount = 0
    globalThis.fetch = async () => {
      callCount++
      if (callCount === 1) {
        return errorResponse(500)
      }
      return okStreamResponse(
        mockBodyStream([
          { done: false, value: sseFrame('evt-recovered') },
          { done: true },
        ]),
      )
    }

    const api = new LiveAccessApi('0xaddr', 'test-token', 'test-community')
    const received: WebhookEventLog[] = []
    let errorCount = 0

    const unsubscribe = api.subscribeWebhookEvents(
      (event) => received.push(event),
      () => {
        errorCount++
      },
    )

    // First fetch attempt: HTTP 500 → error → reconnect
    await sleep(10)
    assert.equal(callCount, 1, 'first fetch call made')
    assert.equal(received.length, 0, 'no events from error response')
    assert.equal(errorCount, 1, 'onError called once for HTTP 500')

    // Backoff (attempt 1: 5ms)
    await sleep(15)
    assert.equal(callCount, 2, 'second fetch call made after reconnect')
    assert.equal(received.length, 1, 'event received after reconnect')
    assert.equal(received[0]!.id, 'evt-recovered')

    unsubscribe()
  })

  it('unsubscribe stops all further reconnect attempts', async () => {
    globalThis.fetch = async () => errorResponse(503)

    const api = new LiveAccessApi('0xaddr', 'test-token', 'test-community')
    let errorCount = 0

    const unsubscribe = api.subscribeWebhookEvents(
      () => {
        assert.fail('onEvent should not be called when all requests fail')
      },
      () => {
        errorCount++
      },
    )

    // First attempt
    await sleep(10)
    assert.equal(errorCount, 1)

    // Unsubscribe before the reconnect fires
    unsubscribe()

    // Wait — reconnect should NOT happen
    await sleep(50)
    assert.equal(errorCount, 1, 'no more errors after unsubscribe')
  })

  it('stops retrying after max attempts and gives up', async () => {
    let callCount = 0
    globalThis.fetch = async () => {
      callCount++
      return errorResponse(500)
    }

    const api = new LiveAccessApi('0xaddr', 'test-token', 'test-community')
    let errorCount = 0

    const unsubscribe = api.subscribeWebhookEvents(
      () => {
        assert.fail('onEvent should not be called')
      },
      () => {
        errorCount++
      },
    )

    // Wait for all attempts (1 initial + 2 retries with backoffs 5ms, 10ms)
    await sleep(100)
    assert.equal(callCount, 3, 'should have made 3 attempts total')
    assert.equal(errorCount, 3, 'onError called 3 times')

    await sleep(200)
    assert.equal(callCount, 3, 'no more attempts after exhausting')
    assert.equal(errorCount, 3, 'no more errors after exhausting')

    unsubscribe()
  })

  it('preserves onError invocation for polling fallback', async () => {
    let callCount = 0
    globalThis.fetch = async () => {
      callCount++
      if (callCount === 1) {
        return okStreamResponse(
          mockBodyStream([
            { done: false, value: sseFrame('evt-a') },
            { done: true },
          ]),
        )
      }
      return okStreamResponse(
        mockBodyStream([
          { done: false, value: sseFrame('evt-b') },
          { done: true },
        ]),
      )
    }

    const api = new LiveAccessApi('0xaddr', 'test-token', 'test-community')
    const received: WebhookEventLog[] = []
    const errors: unknown[] = []

    const unsubscribe = api.subscribeWebhookEvents(
      (event) => received.push(event),
      (err) => {
        errors.push(err)
      },
    )

    // First event
    await sleep(10)
    assert.equal(received.length, 1)
    assert.equal(received[0]!.id, 'evt-a')

    // Stream drops → onError fires with the drop error message
    assert.equal(errors.length, 1, 'onError should have been called')
    assert.ok(
      errors[0] instanceof Error &&
        errors[0].message.includes('closed before unsubscribe'),
      'onError should receive the stream-closed error',
    )

    // Reconnect and get second event
    await sleep(20)
    assert.equal(received.length, 2)
    assert.equal(received[1]!.id, 'evt-b')

    unsubscribe()
  })
})