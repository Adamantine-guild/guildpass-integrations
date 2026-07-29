/**
 * test/integration-resilience.test.ts
 *
 * Tests for lib/integration/resilientCall.ts
 *
 * Covers:
 *  - Transient failure followed by success (retry works)
 *  - Persistent failures trip the circuit breaker (open state)
 *  - Circuit recovers after cooldown (half-open → closed)
 *  - Non-retryable gateway errors propagate without touching the circuit
 *  - Timeout fires when upstream hangs
 */

import './setup-alias'
import { describe, it, beforeEach, afterEach, mock, after } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  resilientCall,
  CircuitOpenError,
  IntegrationTimeoutError,
  resetIntegrationResilienceState,
} from '../lib/integration/resilientCall'
import {
  GatewayConfigurationError,
  GatewayDependencyError,
  GatewayMethodError,
} from '../lib/integration-client'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Advance fake timers and flush microtask queue so awaited promises settle. */
async function tick(ms: number) {
  mock.timers.tick(ms)
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

// Force all config env-vars to deterministic values for every test.
const originalEnv = { ...process.env }
let origRandom: typeof Math.random

beforeEach(() => {
  resetIntegrationResilienceState()
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })

  // Pin configuration so tests are env-independent.
  process.env.INTEGRATION_CALL_TIMEOUT_MS = '200'
  process.env.INTEGRATION_RETRY_MAX_ATTEMPTS = '2'
  process.env.INTEGRATION_RETRY_BASE_DELAY_MS = '50'
  process.env.INTEGRATION_RETRY_MAX_DELAY_MS = '500'
  process.env.INTEGRATION_CIRCUIT_FAILURE_THRESHOLD = '3'
  process.env.INTEGRATION_CIRCUIT_FAILURE_WINDOW_MS = '30000'
  process.env.INTEGRATION_CIRCUIT_COOLDOWN_MS = '10000'

  origRandom = Math.random
  Math.random = () => 0
})

afterEach(() => {
  mock.timers.reset()
  Math.random = origRandom
})

after(() => {
  process.env = originalEnv
  mock.timers.reset()
  resetIntegrationResilienceState()
})

// ---------------------------------------------------------------------------
// Retry: transient failure → eventual success
// ---------------------------------------------------------------------------

describe('resilientCall — retry on transient failures', () => {
  it('returns the result when the first attempt succeeds', async () => {
    const fn = mock.fn(async () => ({ ok: true }))
    const result = await resilientCall(fn, { key: 'test-success' })
    assert.deepEqual(result, { ok: true })
    assert.equal(fn.mock.callCount(), 1)
  })

  it('retries after a transient failure and returns the result on success', async () => {
    let calls = 0
    const fn = mock.fn(async () => {
      calls++
      if (calls < 3) throw new Error('transient upstream error')
      return { ok: true }
    })

    const promise = resilientCall(fn, { key: 'test-retry' })

      // Flush attempt 1 (fails immediately — no delay before first try)
      await tick(0)
      assert.equal(calls, 1)

      // backoff for attempt 2: base=50ms * 2^0 = 50ms, jitter=0
      await tick(50)
      assert.equal(calls, 2)

      // backoff for attempt 3: base=50ms * 2^1 = 100ms, jitter=0
      await tick(100)
      const result = await promise

      assert.deepEqual(result, { ok: true })
      assert.equal(calls, 3)
  })

  it('throws the last error after all retry attempts are exhausted', async () => {
    const upstreamErr = new Error('persistent upstream error')
    const fn = mock.fn(async () => { throw upstreamErr })

    const promise = resilientCall(fn, { key: 'test-exhausted' })
    const assertion = assert.rejects(
      promise,
      (err: Error) => {
        assert.equal(err.message, upstreamErr.message)
        return true
      },
    )

    // Flush all 3 attempts (1 initial + 2 retries) and their backoff delays
    await tick(0)
    await tick(50)
    await tick(100)

    await assertion

    // 1 initial + 2 retries = 3 total calls
    assert.equal(fn.mock.callCount(), 3)
  })
})

// ---------------------------------------------------------------------------
// Circuit breaker: opens after threshold failures
// ---------------------------------------------------------------------------

describe('resilientCall — circuit breaker opens', () => {
  it('trips the circuit open after threshold persistent failures', async () => {
    let calls = 0
    // Fail every attempt so retries count multiple failures per resilientCall invocation.
    // We set RETRY_MAX_ATTEMPTS=0 here to make one call = one failure cleanly.
    process.env.INTEGRATION_RETRY_MAX_ATTEMPTS = '0'

    const fn = mock.fn(async () => {
      calls++
      throw new Error('backend down')
    })

    async function failOnce() {
      try {
        await resilientCall(fn, { key: 'test-circuit' })
        assert.fail('expected resilientCall to throw')
      } catch (err) {
        assert.ok(!(err instanceof CircuitOpenError), 'should not be CircuitOpenError yet')
      }
    }

    // Three failures should trip the circuit (threshold = 3).
    await failOnce()
    await failOnce()
    await failOnce()
    assert.equal(calls, 3)

    // Circuit is now open — next call should fail fast without touching fn.
    await assert.rejects(
      () => resilientCall(fn, { key: 'test-circuit' }),
      (err: unknown) => err instanceof CircuitOpenError,
    )
    assert.equal(calls, 3, 'fn must not be called while circuit is open')
  })
})

// ---------------------------------------------------------------------------
// Circuit breaker: recovers after cooldown (half-open → closed)
// ---------------------------------------------------------------------------

describe('resilientCall — circuit breaker recovery', () => {
  it('allows a probe request after cooldown and closes the circuit on success', async () => {
    process.env.INTEGRATION_RETRY_MAX_ATTEMPTS = '0'

    let calls = 0
    let shouldFail = true

    const fn = mock.fn(async () => {
      calls++
      if (shouldFail) throw new Error('backend down')
      return { recovered: true }
    })

    async function failOnce() {
      try {
        await resilientCall(fn, { key: 'test-recovery' })
      } catch {
        /* expected */
      }
    }

    // Trip the circuit open.
    await failOnce()
    await failOnce()
    await failOnce()
    assert.equal(calls, 3)

    // Confirm circuit is open.
    await assert.rejects(
      () => resilientCall(fn, { key: 'test-recovery' }),
      (err: unknown) => err instanceof CircuitOpenError,
    )
    assert.equal(calls, 3)

    // Advance past the cooldown (10 000 ms).
    await tick(10_001)

    // The circuit should now be half-open. Allow the probe to succeed.
    shouldFail = false
    const result = await resilientCall(fn, { key: 'test-recovery' })

    assert.deepEqual(result, { recovered: true })
    assert.equal(calls, 4, 'exactly one half-open probe call')

    // Circuit should be closed again — next call goes through normally.
    const result2 = await resilientCall(fn, { key: 'test-recovery' })
    assert.deepEqual(result2, { recovered: true })
    assert.equal(calls, 5)
  })

  it('re-opens the circuit when the half-open probe fails', async () => {
    process.env.INTEGRATION_RETRY_MAX_ATTEMPTS = '0'

    let calls = 0
    const fn = mock.fn(async () => {
      calls++
      throw new Error('still down')
    })

    async function failOnce() {
      try {
        await resilientCall(fn, { key: 'test-reopen' })
      } catch {
        /* expected */
      }
    }

    // Trip the circuit.
    await failOnce()
    await failOnce()
    await failOnce()

    // Past cooldown → half-open probe
    await tick(10_001)
    await failOnce() // probe fails → circuit re-opens
    assert.equal(calls, 4)

    // Circuit should be open again immediately.
    await assert.rejects(
      () => resilientCall(fn, { key: 'test-reopen' }),
      (err: unknown) => err instanceof CircuitOpenError,
    )
    assert.equal(calls, 4, 'fn must not be called while circuit is re-opened')
  })
})

// ---------------------------------------------------------------------------
// Non-retryable gateway errors bypass retry and circuit
// ---------------------------------------------------------------------------

describe('resilientCall — non-retryable gateway errors', () => {
  it('propagates GatewayConfigurationError immediately without retry', async () => {
    const fn = mock.fn(async () => {
      throw new GatewayConfigurationError('INTEGRATION_API_KEY missing')
    })

    await assert.rejects(
      () => resilientCall(fn, { key: 'cfg-err' }),
      (err: unknown) => err instanceof GatewayConfigurationError,
    )
    // Only 1 attempt — no retry
    assert.equal(fn.mock.callCount(), 1)
  })

  it('propagates GatewayDependencyError immediately without retry', async () => {
    const fn = mock.fn(async () => {
      throw new GatewayDependencyError('optional package not installed')
    })

    await assert.rejects(
      () => resilientCall(fn, { key: 'dep-err' }),
      (err: unknown) => err instanceof GatewayDependencyError,
    )
    assert.equal(fn.mock.callCount(), 1)
  })

  it('propagates GatewayMethodError immediately without retry', async () => {
    const fn = mock.fn(async () => {
      throw new GatewayMethodError('method not found')
    })

    await assert.rejects(
      () => resilientCall(fn, { key: 'method-err' }),
      (err: unknown) => err instanceof GatewayMethodError,
    )
    assert.equal(fn.mock.callCount(), 1)
  })

  it('does not increment the circuit failure counter on non-retryable errors', async () => {
    process.env.INTEGRATION_RETRY_MAX_ATTEMPTS = '0'
    process.env.INTEGRATION_CIRCUIT_FAILURE_THRESHOLD = '2'

    const cfgFn = mock.fn(async () => {
      throw new GatewayConfigurationError('key missing')
    })

    // Call more times than the threshold — circuit must NOT open.
    for (let i = 0; i < 5; i++) {
      await assert.rejects(
        () => resilientCall(cfgFn, { key: 'no-circuit-cfg' }),
        (err: unknown) => err instanceof GatewayConfigurationError,
      )
    }

    // A fresh-fn call on the same key should be let through (circuit still closed).
    let probeReached = false
    const probeFn = async () => {
      probeReached = true
      return { ok: true }
    }

    const result = await resilientCall(probeFn, { key: 'no-circuit-cfg' })
    assert.ok(probeReached, 'circuit must be closed — fn should be called')
    assert.deepEqual(result, { ok: true })
  })
})

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

describe('resilientCall — timeout', () => {
  it('throws IntegrationTimeoutError when the upstream call hangs', async () => {
    process.env.INTEGRATION_CALL_TIMEOUT_MS = '100'
    process.env.INTEGRATION_RETRY_MAX_ATTEMPTS = '0'

    // A promise that never resolves.
    const fn = mock.fn(() => new Promise<never>(() => {}))

    const promise = resilientCall(fn, { key: 'test-timeout' })
    const assertion = assert.rejects(
      promise,
      (err: unknown) => err instanceof IntegrationTimeoutError,
    )

    // Advance past the timeout
    await tick(200)

    await assertion
  })

  it('counts a timeout as a transient failure for circuit-breaker purposes', async () => {
    process.env.INTEGRATION_CALL_TIMEOUT_MS = '50'
    process.env.INTEGRATION_RETRY_MAX_ATTEMPTS = '0'
    process.env.INTEGRATION_CIRCUIT_FAILURE_THRESHOLD = '3'

    const fn = mock.fn(() => new Promise<never>(() => {}))

    async function timeoutOnce() {
      const p = resilientCall(fn, { key: 'timeout-circuit' })
      const assertion = assert.rejects(p)
      await tick(200)
      await assertion
    }

    await timeoutOnce()
    await timeoutOnce()
    await timeoutOnce()

    // Circuit must be open now
    await assert.rejects(
      () => resilientCall(fn, { key: 'timeout-circuit' }),
      (err: unknown) => err instanceof CircuitOpenError,
    )
  })
})
