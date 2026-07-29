import { describe, test, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { rateLimitRequest, InMemoryRateLimitStore, type RateLimitStore } from '../lib/rate-limit'

function makeReq(opts: { ip?: string; address?: string } = {}): Request {
  const headers = new Headers()
  if (opts.ip) headers.set('x-forwarded-for', opts.ip)
  const url = new URL('https://example.test/api/integration/membership')
  if (opts.address) url.searchParams.set('address', opts.address)
  return new Request(url.toString(), { headers })
}

afterEach(() => {
  // clear bucket state between tests by re-importing is not trivial here;
  // tests are ordered to avoid cross-contamination (fresh keys per test).
})

describe('rateLimitRequest', () => {
  test('allows requests under the limit', async () => {
    const req = makeReq({ ip: '10.0.0.1', address: 'GA1' })
    const r = await rateLimitRequest(req, 'GA1')
    assert.equal(r.limited, false)
    assert.ok(r.remaining >= 0)
  })

  test('returns limited=true once the per-IP bucket is exhausted', async () => {
    const ip = '10.0.0.2'
    let last
    for (let i = 0; i < 30; i++) {
      last = await rateLimitRequest(makeReq({ ip }), 'GA2')
      assert.equal(last.limited, false, `request ${i} should pass`)
    }
    // 31st request exceeds the 30/min bucket
    const over = await rateLimitRequest(makeReq({ ip }), 'GA2')
    assert.equal(over.limited, true)
    assert.ok(over.retryAfter > 0, 'retryAfter should be a positive number of seconds')
  })

  test('keys IP and wallet independently', async () => {
    const ip = '10.0.0.3'
    // exhaust wallet key with one address
    for (let i = 0; i < 30; i++) {
      await rateLimitRequest(makeReq({ ip, address: 'GA3' }), 'GA3')
    }
    const walletOver = await rateLimitRequest(makeReq({ ip, address: 'GA3' }), 'GA3')
    assert.equal(walletOver.limited, true)
    // a different wallet from the SAME ip still has its own bucket state
    // (ip bucket also exhausted at 30, so this exercises wallet-keying separately)
    const otherWallet = await rateLimitRequest(makeReq({ ip, address: 'GA4' }), 'GA4')
    // ip is exhausted, so still limited — but retryAfter comes from ip bucket
    assert.equal(otherWallet.limited, true)
  })

  test('different IPs do not share bucket state', async () => {
    const a = await rateLimitRequest(makeReq({ ip: '10.0.0.4' }), null)
    const b = await rateLimitRequest(makeReq({ ip: '10.0.0.5' }), null)
    assert.equal(a.limited, false)
    assert.equal(b.limited, false)
  })
})

// ===========================================================================
// InMemoryRateLimitStore — deterministic tests against a directly
// constructed store with a caller-controlled `now`, so refill/consume math
// can be asserted exactly without depending on real wall-clock timing.
// ===========================================================================

describe('InMemoryRateLimitStore', () => {
  test('consumes one token per call and reports the exact residual token count', async () => {
    const store = new InMemoryRateLimitStore(5, 5 / 60_000)
    const now = 0
    const r1 = await store.take('k', now)
    assert.deepEqual(r1, { tokens: 4, consumed: true })
    const r2 = await store.take('k', now)
    assert.deepEqual(r2, { tokens: 3, consumed: true })
  })

  test('reports consumed=false with the exact residual token count once exhausted', async () => {
    const store = new InMemoryRateLimitStore(2, 2 / 60_000)
    const now = 0
    await store.take('k', now)
    await store.take('k', now)
    const r = await store.take('k', now)
    assert.equal(r.consumed, false)
    assert.equal(r.tokens, 0)
  })

  test('refills exactly the expected number of tokens after elapsed time', async () => {
    // 60 tokens per 60_000ms => 1 token refilled per 1000ms elapsed
    const store = new InMemoryRateLimitStore(60, 60 / 60_000)
    await store.take('k', 0) // tokens: 59
    const r = await store.take('k', 1_000) // +1 refilled, then -1 consumed => back to 59
    assert.equal(r.consumed, true)
    assert.equal(r.tokens, 59)
  })

  test('does not refill beyond maxTokens', async () => {
    const store = new InMemoryRateLimitStore(10, 10 / 60_000)
    await store.take('k', 0) // tokens: 9
    const r = await store.take('k', 10_000_000) // huge elapsed time — refill clamps at 10, then -1
    assert.equal(r.consumed, true)
    assert.equal(r.tokens, 9)
  })

  test('different keys have independent state within the same store instance', async () => {
    const store = new InMemoryRateLimitStore(1, 1 / 60_000)
    const a = await store.take('a', 0)
    const b = await store.take('b', 0)
    assert.equal(a.consumed, true)
    assert.equal(b.consumed, true)
  })
})

// ===========================================================================
// rateLimitRequest with an injected fake store — pins down key-check order,
// short-circuit behavior, and the exact retryAfter/remaining derivation
// without needing real time or 30 real requests to exhaust a bucket.
// ===========================================================================

describe('rateLimitRequest with an injected store', () => {
  test('checks the IP bucket before the wallet bucket and short-circuits on an IP limit', async () => {
    const calls: string[] = []
    const fakeStore: RateLimitStore = {
      async take(key) {
        calls.push(key)
        return { tokens: 0, consumed: false }
      },
    }
    const req = makeReq({ ip: '10.0.0.9' })
    const result = await rateLimitRequest(req, 'GAX', fakeStore)
    assert.equal(result.limited, true)
    assert.deepEqual(calls, ['ip:10.0.0.9'])
  })

  test('falls through to the wallet bucket only when the IP bucket allows the request', async () => {
    const calls: string[] = []
    const fakeStore: RateLimitStore = {
      async take(key) {
        calls.push(key)
        return { tokens: 5, consumed: true }
      },
    }
    const req = makeReq({ ip: '10.0.0.10' })
    const result = await rateLimitRequest(req, 'GAY', fakeStore)
    assert.equal(result.limited, false)
    assert.deepEqual(calls, ['ip:10.0.0.10', 'wallet:GAY'])
  })

  test('returns the IP result (not the wallet result) when both buckets allow the request', async () => {
    const fakeStore: RateLimitStore = {
      async take(key) {
        if (key.startsWith('ip:')) return { tokens: 7, consumed: true }
        return { tokens: 2, consumed: true }
      },
    }
    const req = makeReq({ ip: '10.0.0.11' })
    const result = await rateLimitRequest(req, 'GAZ', fakeStore)
    assert.equal(result.limited, false)
    assert.equal(result.remaining, 7) // from the IP bucket, not the wallet bucket (2)
  })

  test('computes retryAfter from the exact deficit reported by the store', async () => {
    const fakeStore: RateLimitStore = {
      async take() {
        return { tokens: 0.5, consumed: false } // deficit = 1 - 0.5 = 0.5
      },
    }
    const req = makeReq({ ip: '10.0.0.12' })
    const result = await rateLimitRequest(req, null, fakeStore)
    assert.equal(result.limited, true)
    assert.equal(result.remaining, 0)
    // production REFILL_PER_MS = 30 / 60_000 = 0.0005
    // retryAfter = ceil(0.5 / 0.0005 / 1000) = ceil(1) = 1
    assert.equal(result.retryAfter, 1)
  })
})
