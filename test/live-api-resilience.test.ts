import './setup-env'
import { afterEach, mock, test } from 'node:test'
import * as assert from 'node:assert/strict'
import { LiveAccessApi, resetLiveApiResilienceState } from '../lib/api/live'
import { ApiError } from '../lib/api/errors'

const communityBody = JSON.stringify({ id: 'c1', name: 'Guild', tiers: ['free'] })

afterEach(() => {
  mock.timers.reset()
  resetLiveApiResilienceState()
})

async function tick(ms: number) {
  mock.timers.tick(ms)
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

test('GET requests retry retryable failures with exponential backoff', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  const originalRandom = Math.random
  Math.random = () => 0
  let calls = 0
  global.fetch = async () => {
    calls += 1
    if (calls < 3) {
      return new Response('', { status: 502 }) as any
    }
    return new Response(communityBody, { status: 200 }) as any
  }

  try {
    const promise = new LiveAccessApi().getCommunity()
    await tick(0)
    assert.equal(calls, 1)
    await tick(100)
    assert.equal(calls, 2)
    await tick(200)
    const community = await promise

    assert.equal(calls, 3)
    assert.equal(community.id, 'c1')
  } finally {
    Math.random = originalRandom
  }
})

test('POST requests never auto-retry', async () => {
  let calls = 0
  global.fetch = async () => {
    calls += 1
    return new Response('', { status: 500 }) as any
  }

  await assert.rejects(
    () => new LiveAccessApi().getNonce('0xabc'),
    (err: ApiError) => err instanceof ApiError && err.code === 'server_error',
  )
  assert.equal(calls, 1)
})

test('circuit breaker opens after repeated failures and half-opens after cooldown', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  let calls = 0
  // Raw network errors (fetch throws) bypass the retry loop entirely —
  // getJson wraps them as network_error and immediately throws, so each
  // request produces exactly one fetch call.
  global.fetch = async () => {
    calls += 1
    throw new Error('backend down')
  }

  async function failRequest() {
    try {
      await new LiveAccessApi().getCommunity()
      assert.fail('expected getCommunity to reject')
    } catch (err) {
      assert.ok(err instanceof ApiError && err.code === 'network_error')
    }
  }

  // Three failures within the window trigger the circuit to open
  // (CIRCUIT_FAILURE_THRESHOLD = 3). Each raw-network-error request = 1 call.
  await failRequest()
  await failRequest()
  await failRequest()
  assert.equal(calls, 3)

  // Circuit is now open — new requests are rejected immediately
  // without touching fetch.
  await assert.rejects(
    () => new LiveAccessApi().getCommunity(),
    (err: ApiError) => err instanceof ApiError && err.code === 'service_unavailable',
  )
  assert.equal(calls, 3, 'no additional fetch calls while circuit is open')

  // After cooldown (10 s) the circuit transitions to half-open,
  // allowing one probe request.
  await tick(10_000)
  await failRequest()
  assert.equal(calls, 4, 'one half-open probe call')
})
