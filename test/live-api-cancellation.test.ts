/**
 * test/live-api-cancellation.test.ts
 *
 * Tests for AbortSignal / request-cancellation support (issue #23).
 *
 * Covers:
 *  1. Signal is forwarded to the underlying fetch() call.
 *  2. Aborting mid-flight produces an ApiError with code 'aborted'.
 *  3. Aborted requests do NOT increment the circuit-breaker failure counter.
 *  4. Rapid wallet-switch: only the last wallet's data resolves; the first
 *     wallet's in-flight request is cancelled and never lands in state.
 */
import './setup-env'
import { test, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { LiveAccessApi, resetLiveApiResilienceState } from '../lib/api/live'
import { ApiError } from '../lib/api/errors'

afterEach(() => {
  resetLiveApiResilienceState()
})

// ── 1. Signal is passed to fetch ─────────────────────────────────────────────

test('signal is forwarded to fetch for getSession', async () => {
  const controller = new AbortController()
  let capturedSignal: AbortSignal | undefined

  global.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    capturedSignal = init?.signal ?? undefined
    return new Response(
      JSON.stringify({ roles: [], community: { id: 'c1', name: 'Guild', tiers: ['free'] } }),
      { status: 200 },
    ) as any
  }

  const api = new LiveAccessApi('0xabc')
  await api.getSession(controller.signal)

  assert.ok(capturedSignal !== undefined, 'fetch should receive a signal')
  assert.strictEqual(capturedSignal, controller.signal)
})

test('signal is forwarded to fetch for getCommunity', async () => {
  const controller = new AbortController()
  let capturedSignal: AbortSignal | undefined

  global.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    capturedSignal = init?.signal ?? undefined
    return new Response(
      JSON.stringify({ id: 'c1', name: 'Guild', tiers: ['free'] }),
      { status: 200 },
    ) as any
  }

  const api = new LiveAccessApi()
  await api.getCommunity(controller.signal)

  assert.ok(capturedSignal !== undefined, 'fetch should receive a signal')
  assert.strictEqual(capturedSignal, controller.signal)
})

test('signal is forwarded to fetch for listResources', async () => {
  const controller = new AbortController()
  let capturedSignal: AbortSignal | undefined

  global.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    capturedSignal = init?.signal ?? undefined
    return new Response(JSON.stringify([]), { status: 200 }) as any
  }

  const api = new LiveAccessApi()
  await api.listResources(controller.signal)

  assert.ok(capturedSignal !== undefined)
  assert.strictEqual(capturedSignal, controller.signal)
})

test('signal is forwarded to fetch for listWebhookEvents', async () => {
  const controller = new AbortController()
  let capturedSignal: AbortSignal | undefined

  global.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    capturedSignal = init?.signal ?? undefined
    return new Response(JSON.stringify([]), { status: 200 }) as any
  }

  const api = new LiveAccessApi('0xabc', 'token')
  await api.listWebhookEvents(controller.signal)

  assert.ok(capturedSignal !== undefined)
  assert.strictEqual(capturedSignal, controller.signal)
})

test('signal is forwarded to fetch for getAnalyticsSummary', async () => {
  const controller = new AbortController()
  let capturedSignal: AbortSignal | undefined

  global.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    capturedSignal = init?.signal ?? undefined
    return new Response(
      JSON.stringify({
        totalMembers: 10,
        activeMembers: 8,
        memberGrowth: [],
        resourceAccess: [],
        generatedAt: new Date().toISOString(),
      }),
      { status: 200 },
    ) as any
  }

  const api = new LiveAccessApi('0xabc', 'token')
  await api.getAnalyticsSummary(controller.signal)

  assert.ok(capturedSignal !== undefined)
  assert.strictEqual(capturedSignal, controller.signal)
})

// ── 2. Abort produces ApiError with code 'aborted' ───────────────────────────

test('aborting before fetch throws ApiError with code aborted', async () => {
  const controller = new AbortController()
  controller.abort() // abort immediately — before fetch is even called

  global.fetch = async () => {
    // Should never be reached
    return new Response('{}', { status: 200 }) as any
  }

  const api = new LiveAccessApi()
  await assert.rejects(
    () => api.getCommunity(controller.signal),
    (err: ApiError) =>
      err instanceof ApiError &&
      err.code === 'aborted' &&
      err.retryable === false,
  )
})

test('aborting mid-flight (fetch throws AbortError) produces ApiError with code aborted', async () => {
  const controller = new AbortController()

  global.fetch = async () => {
    // Simulate fetch throwing when the signal fires
    const abortErr = new DOMException('The operation was aborted.', 'AbortError')
    throw abortErr
  }

  const api = new LiveAccessApi()
  await assert.rejects(
    () => api.getCommunity(controller.signal),
    (err: ApiError) =>
      err instanceof ApiError &&
      err.code === 'aborted' &&
      err.retryable === false,
  )
})

test('abort error from getCommunity is never retried and has no retryable flag', async () => {
  const controller = new AbortController()
  let fetchCallCount = 0

  global.fetch = async () => {
    fetchCallCount += 1
    const abortErr = new DOMException('Aborted', 'AbortError')
    throw abortErr
  }

  const api = new LiveAccessApi()
  await assert.rejects(
    () => api.getCommunity(controller.signal),
    (err: ApiError) => err instanceof ApiError && err.code === 'aborted',
  )

  // fetch should only be called once — no retries on abort
  assert.strictEqual(fetchCallCount, 1, 'aborted fetch must not be retried')
})

// ── 3. Aborted requests do NOT trip the circuit breaker ──────────────────────

test('aborted requests do not count as circuit-breaker failures', async () => {
  // Exhaust the circuit breaker threshold with real failures first — we need
  // 3 × RETRY_MAX_ATTEMPTS (9) network errors to open the circuit by default.
  // Then verify that abort errors do NOT open it on their own.

  // Reset to a clean state and use a *separate* path for the abort test
  // to avoid cross-test contamination with the circuit for '/v1/community'.
  // We'll test via getProfile which calls /v1/members/:address/profile.
  let abortCallCount = 0

  global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    abortCallCount += 1
    const abortErr = new DOMException('Aborted', 'AbortError')
    throw abortErr
  }

  const api = new LiveAccessApi('0xabc')
  const threshold = 5 // more than CIRCUIT_FAILURE_THRESHOLD (3)

  for (let i = 0; i < threshold; i++) {
    await assert.rejects(
      () => api.getProfile('0xabc'),
      (err: ApiError) => err instanceof ApiError && err.code === 'aborted',
    )
  }

  assert.strictEqual(abortCallCount, threshold)

  // Circuit must still be closed — the next *real* request should reach fetch,
  // not get a service_unavailable short-circuit.
  let realFetchCalled = false
  global.fetch = async () => {
    realFetchCalled = true
    return new Response('null', { status: 200 }) as any
  }

  // A real (non-aborted) request should succeed — circuit is still closed
  const profile = await api.getProfile('0xabc')
  assert.ok(realFetchCalled, 'circuit must still be closed after abort-only failures')
  assert.strictEqual(profile, null)
})

// ── 4. Rapid wallet-switch: only latest wallet's data lands ──────────────────

test('rapid wallet switch — only the latest wallet request resolves', async () => {
  // Simulate two concurrent getSession calls: first wallet's fetch takes
  // longer, second wallet's fetch is faster. We capture which calls resolve
  // and which are aborted.
  const wallet1 = '0xwallet1111111111111111111111111111111111'
  const wallet2 = '0xwallet2222222222222222222222222222222222'

  const wallet1Controller = new AbortController()
  const wallet2Controller = new AbortController()

  const sessionForWallet1 = {
    roles: [],
    address: wallet1,
    community: { id: 'demo', name: 'Demo', tiers: ['free'] },
  }
  const sessionForWallet2 = {
    roles: [],
    address: wallet2,
    community: { id: 'demo', name: 'Demo', tiers: ['free'] },
  }

  // Resolve order: wallet2 resolves immediately, wallet1 resolves after a tick.
  // We will abort wallet1 as soon as wallet2 starts (simulating React Query
  // cancellation on queryKey change from wallet1 → wallet2).
  let resolveWallet1!: () => void
  const wallet1Pending = new Promise<void>((res) => { resolveWallet1 = res })

  global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const signal = init?.signal

    // Determine which wallet this request belongs to from the URL
    const urlStr = String(url)
    const isWallet1Request = urlStr.includes(encodeURIComponent(wallet1))

    if (isWallet1Request) {
      // Wallet1's fetch waits and respects abort
      return new Promise<Response>((resolve, reject) => {
        if (signal) {
          signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }
        // Also unblock when wallet1Pending resolves (for cleanup)
        wallet1Pending.then(() => {
          resolve(new Response(JSON.stringify(sessionForWallet1), { status: 200 }) as any)
        })
      })
    } else {
      // Wallet2's fetch resolves immediately
      return new Response(JSON.stringify(sessionForWallet2), { status: 200 }) as any
    }
  }

  const api1 = new LiveAccessApi(wallet1)
  const api2 = new LiveAccessApi(wallet2)

  // Start wallet1's request
  const promise1 = api1.getSession(wallet1Controller.signal)

  // Immediately switch: abort wallet1 and start wallet2
  wallet1Controller.abort()
  const result2 = await api2.getSession(wallet2Controller.signal)

  // wallet1's request must have been aborted
  await assert.rejects(
    () => promise1,
    (err: ApiError) => err instanceof ApiError && err.code === 'aborted',
    'wallet1 request must be aborted, not resolved',
  )

  // Only wallet2's data is available
  assert.strictEqual(
    (result2 as any).address,
    wallet2,
    'only wallet2 data should have resolved',
  )

  // Unblock wallet1 fetch cleanup
  resolveWallet1()
})
