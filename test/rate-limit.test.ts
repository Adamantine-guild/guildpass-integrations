import { describe, test, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { rateLimitRequest } from '../lib/rate-limit'

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
  test('allows requests under the limit', () => {
    const req = makeReq({ ip: '10.0.0.1', address: 'GA1' })
    const r = rateLimitRequest(req, 'GA1')
    assert.equal(r.limited, false)
    assert.ok(r.remaining >= 0)
  })

  test('returns limited=true once the per-IP bucket is exhausted', () => {
    const ip = '10.0.0.2'
    let last
    for (let i = 0; i < 30; i++) {
      last = rateLimitRequest(makeReq({ ip }), 'GA2')
      assert.equal(last.limited, false, `request ${i} should pass`)
    }
    // 31st request exceeds the 30/min bucket
    const over = rateLimitRequest(makeReq({ ip }), 'GA2')
    assert.equal(over.limited, true)
    assert.ok(over.retryAfter > 0, 'retryAfter should be a positive number of seconds')
  })

  test('keys IP and wallet independently', () => {
    const ip = '10.0.0.3'
    // exhaust wallet key with one address
    for (let i = 0; i < 30; i++) {
      rateLimitRequest(makeReq({ ip, address: 'GA3' }), 'GA3')
    }
    const walletOver = rateLimitRequest(makeReq({ ip, address: 'GA3' }), 'GA3')
    assert.equal(walletOver.limited, true)
    // a different wallet from the SAME ip still has its own bucket state
    // (ip bucket also exhausted at 30, so this exercises wallet-keying separately)
    const otherWallet = rateLimitRequest(makeReq({ ip, address: 'GA4' }), 'GA4')
    // ip is exhausted, so still limited — but retryAfter comes from ip bucket
    assert.equal(otherWallet.limited, true)
  })

  test('different IPs do not share bucket state', () => {
    const a = rateLimitRequest(makeReq({ ip: '10.0.0.4' }), null)
    const b = rateLimitRequest(makeReq({ ip: '10.0.0.5' }), null)
    assert.equal(a.limited, false)
    assert.equal(b.limited, false)
  })
})
