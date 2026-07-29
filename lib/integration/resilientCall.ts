/**
 * lib/integration/resilientCall.ts
 *
 * Server-side resilience wrapper for @guildpass/integration-client calls.
 *
 * Provides:
 *  - Request timeout backed by AbortSignal
 *  - Retry with exponential backoff for transient errors
 *  - Circuit breaker (closed → open → half-open → closed) that short-circuits
 *    to a fast failure once repeated upstream failures are detected
 *
 * Non-retryable gateway errors (GatewayConfigurationError, GatewayDependencyError,
 * GatewayMethodError) propagate immediately — they do NOT trigger retries and do
 * NOT increment the circuit failure counter — so the existing "missing package /
 * missing key → safe 503" behaviour is completely unaffected.
 *
 * Configuration (all optional, with sensible defaults):
 *   INTEGRATION_CALL_TIMEOUT_MS          default 5 000
 *   INTEGRATION_RETRY_MAX_ATTEMPTS       default 2  (+ 1 initial attempt = 3 total)
 *   INTEGRATION_RETRY_BASE_DELAY_MS      default 100
 *   INTEGRATION_RETRY_MAX_DELAY_MS       default 1 000
 *   INTEGRATION_CIRCUIT_FAILURE_THRESHOLD  default 3
 *   INTEGRATION_CIRCUIT_FAILURE_WINDOW_MS  default 30 000
 *   INTEGRATION_CIRCUIT_COOLDOWN_MS        default 10 000
 */

import {
  GatewayConfigurationError,
  GatewayDependencyError,
  GatewayMethodError,
} from '@/lib/integration-client'

// ---------------------------------------------------------------------------
// Exported error for circuit-open state
// ---------------------------------------------------------------------------

/** Thrown when the circuit breaker is open and the call is rejected fast. */
export class CircuitOpenError extends Error {
  constructor(key: string) {
    super(`Integration gateway circuit is open for "${key}". Failing fast.`)
    this.name = 'CircuitOpenError'
  }
}

/** Thrown when the upstream call exceeds the configured timeout. */
export class IntegrationTimeoutError extends Error {
  constructor(key: string, timeoutMs: number) {
    super(`Integration call "${key}" timed out after ${timeoutMs} ms.`)
    this.name = 'IntegrationTimeoutError'
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function envInt(name: string, fallback: number): number {
  const val = process.env[name]
  if (val === undefined || val === '') return fallback
  const parsed = Number(val)
  return Number.isFinite(parsed) ? parsed : fallback
}

const TIMEOUT_MS = () => envInt('INTEGRATION_CALL_TIMEOUT_MS', 5_000)
const RETRY_MAX_ATTEMPTS = () => envInt('INTEGRATION_RETRY_MAX_ATTEMPTS', 2)
const RETRY_BASE_DELAY_MS = () => envInt('INTEGRATION_RETRY_BASE_DELAY_MS', 100)
const RETRY_MAX_DELAY_MS = () => envInt('INTEGRATION_RETRY_MAX_DELAY_MS', 1_000)
const CIRCUIT_FAILURE_THRESHOLD = () =>
  envInt('INTEGRATION_CIRCUIT_FAILURE_THRESHOLD', 3)
const CIRCUIT_FAILURE_WINDOW_MS = () =>
  envInt('INTEGRATION_CIRCUIT_FAILURE_WINDOW_MS', 30_000)
const CIRCUIT_COOLDOWN_MS = () =>
  envInt('INTEGRATION_CIRCUIT_COOLDOWN_MS', 10_000)

// ---------------------------------------------------------------------------
// Circuit breaker state
// ---------------------------------------------------------------------------

type CircuitState = 'closed' | 'open' | 'half-open'

interface CircuitEntry {
  state: CircuitState
  /** Timestamps (ms) of recent failures within the sliding window. */
  failures: number[]
  openedAt?: number
  halfOpenProbeInFlight: boolean
}

/** Module-level singleton — one circuit per integration key (e.g. "membership", "verify"). */
const circuits = new Map<string, CircuitEntry>()

function getCircuit(key: string): CircuitEntry {
  let c = circuits.get(key)
  if (!c) {
    c = { state: 'closed', failures: [], halfOpenProbeInFlight: false }
    circuits.set(key, c)
  }
  return c
}

/** Checks whether the circuit allows a new request, advancing state as needed. */
function assertCircuitAllows(key: string): void {
  const c = getCircuit(key)
  if (c.state !== 'open') return

  const elapsed = Date.now() - (c.openedAt ?? 0)
  if (elapsed >= CIRCUIT_COOLDOWN_MS()) {
    // Transition to half-open: allow exactly one probe
    c.state = 'half-open'
    c.halfOpenProbeInFlight = false
  } else {
    throw new CircuitOpenError(key)
  }

  if (c.halfOpenProbeInFlight) {
    // Another probe is already in-flight; reject this request
    throw new CircuitOpenError(key)
  }
  c.halfOpenProbeInFlight = true
}

function recordSuccess(key: string): void {
  const c = getCircuit(key)
  c.state = 'closed'
  c.failures = []
  c.openedAt = undefined
  c.halfOpenProbeInFlight = false
}

function recordFailure(key: string): void {
  const now = Date.now()
  const c = getCircuit(key)
  // Prune failures outside the sliding window
  c.failures = c.failures.filter((t) => now - t <= CIRCUIT_FAILURE_WINDOW_MS())
  c.failures.push(now)
  c.halfOpenProbeInFlight = false

  if (
    c.state === 'half-open' ||
    c.failures.length >= CIRCUIT_FAILURE_THRESHOLD()
  ) {
    c.state = 'open'
    c.openedAt = now
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function backoffMs(attemptIndex: number): number {
  const base = RETRY_BASE_DELAY_MS()
  const cap = RETRY_MAX_DELAY_MS()
  const exp = Math.min(base * 2 ** Math.max(0, attemptIndex - 1), cap)
  const jitter = Math.floor(Math.random() * exp * 0.25)
  return exp + jitter
}

/**
 * Returns true for errors that should be retried AND counted against the circuit.
 * Non-gateway errors (e.g. plain network timeouts) are retryable.
 * Gateway configuration/dependency/method errors are NOT retryable.
 */
function isRetryable(err: unknown): boolean {
  if (
    err instanceof GatewayConfigurationError ||
    err instanceof GatewayDependencyError ||
    err instanceof GatewayMethodError
  ) {
    return false
  }
  // IntegrationTimeoutError and generic Error are transient → retryable
  return true
}

// ---------------------------------------------------------------------------
// Core wrapper
// ---------------------------------------------------------------------------

export interface ResilientCallOptions {
  /** Logical name used as the circuit breaker key and in log messages. */
  key: string
}

/**
 * Wraps an async integration call with timeout, retry-with-backoff, and a
 * circuit breaker. Returns the resolved value or throws one of:
 *   - CircuitOpenError         — circuit is open, fast 503
 *   - IntegrationTimeoutError  — upstream did not respond in time
 *   - GatewayConfigurationError / GatewayDependencyError / GatewayMethodError
 *                              — non-retryable gateway errors (existing behaviour)
 *   - Error                    — other upstream error after all retries exhausted
 */
export async function resilientCall<T>(
  fn: () => Promise<T>,
  options: ResilientCallOptions,
): Promise<T> {
  const { key } = options

  // Will throw CircuitOpenError immediately if the breaker is open.
  assertCircuitAllows(key)

  const maxRetries = RETRY_MAX_ATTEMPTS()
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const timeoutMs = TIMEOUT_MS()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      // Race the integration call against the abort signal.
      // We pass the signal down via a race so the fn itself doesn't need
      // to accept it — the pattern works for opaque third-party clients.
      const result = await Promise.race<T>([
        fn(),
        new Promise<never>((_, reject) =>
          controller.signal.addEventListener('abort', () =>
            reject(new IntegrationTimeoutError(key, timeoutMs)),
          ),
        ),
      ])

      clearTimeout(timer)
      recordSuccess(key)
      return result
    } catch (err: unknown) {
      clearTimeout(timer)

      // Non-retryable gateway errors bypass retry and circuit entirely.
      if (
        err instanceof GatewayConfigurationError ||
        err instanceof GatewayDependencyError ||
        err instanceof GatewayMethodError
      ) {
        throw err
      }

      lastError = err
      recordFailure(key)

      const isLast = attempt >= maxRetries
      if (isLast || !isRetryable(err)) {
        break
      }

      const delay = backoffMs(attempt)
      console.warn(
        `[Integration Resilience] "${key}" attempt ${attempt + 1} failed; ` +
          `retrying in ${delay} ms. Error: ${err instanceof Error ? err.message : String(err)}`,
      )
      await sleep(delay)
    }
  }

  throw lastError
}

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

/**
 * Resets all circuit breaker state. Intended for use in test teardown only.
 */
export function resetIntegrationResilienceState(): void {
  circuits.clear()
}
