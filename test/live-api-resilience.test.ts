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
    await Promise.resolve()
    assert.equal(calls, 1)
    mock.timers.tick(100)
    await Promise.resolve()
    assert.equal(calls, 2)
    mock.timers.tick(200)
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

test('circuit breaker opens after repeated GET failures and half-opens after cooldown', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  let calls = 0
  global.fetch = async () => {
    calls += 1
    throw new Error('backend down')
  }

  async function failRequest() {
    const promise = new LiveAccessApi().getCommunity()
    await Promise.resolve()
    mock.timers.tick(100)
    await Promise.resolve()
    mock.timers.tick(200)
    await assert.rejects(
      () => promise,
      (err: ApiError) => err instanceof ApiError && err.code === 'network_error',
    )
  }

  await failRequest()
  await failRequest()
  await failRequest()
  assert.equal(calls, 9)

  await assert.rejects(
    () => new LiveAccessApi().getCommunity(),
    (err: ApiError) => err instanceof ApiError && err.code === 'service_unavailable',
  )
  assert.equal(calls, 9)

  mock.timers.tick(10_000)
  await failRequest()
  assert.equal(calls, 12)
})
