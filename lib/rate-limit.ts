/**
 * Pluggable token-bucket rate limiter for the integration gateway routes.
 *
 * The token-bucket refill/consume algorithm is decoupled from storage via
 * the RateLimitStore interface. `InMemoryRateLimitStore` (the default)
 * keeps bucket state in a per-process Map — sufficient for a single
 * Next.js instance. Bounded bucket eviction (idle pruning + LRU capacity cap)
 * prevents unbounded memory growth. If you run more than one instance behind a load
 * balancer, each instance keeps its own counters and the effective limit is
 * multiplied by the instance count. For multi-instance or serverless (edge)
 * deployments, inject a shared RateLimitStore backed by Redis or another
 * shared backend — see docs/deployment.md "Production rate-limiting" for
 * the upgrade path and why the store's take() must be atomic.
 */

export interface RateLimitResult {
  limited: boolean
  /** Seconds the caller must wait before retrying (0 when not limited). */
  retryAfter: number
  /** Requests remaining in the current window. */
  remaining: number
}

/**
 * Storage contract for the token-bucket algorithm. A single atomic method
 * on purpose: it must create-if-absent, refill for elapsed time, and
 * consume one token as one indivisible operation.
 *
 * Implementations MUST perform this atomically against the backing store
 * (e.g. a Redis Lua script or a MULTI/EXEC transaction). A plain "GET the
 * current state, compute the next state in the client, SET it back" pair of
 * remote calls is NOT sufficient: two concurrent callers (two instances, or
 * two in-flight requests on one instance racing across an await) can both
 * read the same starting state, both compute independently, and both write
 * back — silently losing one of the two token consumptions. That failure
 * mode defeats the entire purpose of a shared store, so a store must never
 * be built that way.
 */
export interface RateLimitStore {
  take(key: string, now: number): Promise<{ tokens: number; consumed: boolean }>
}

interface Bucket {
  tokens: number
  /** epoch ms of the last refill */
  last: number
  /** epoch ms of the last access */
  lastAccess: number
}

export interface InMemoryRateLimitStoreOptions {
  /** Maximum number of buckets allowed before LRU eviction. Defaults to 10,000. */
  maxBuckets?: number
  /** Inactivity threshold (ms) after which a fully-refilled bucket is evicted. Defaults to full refill time (maxTokens / refillPerMs). */
  idleTimeoutMs?: number
}

/**
 * Default RateLimitStore: per-process Map with bounded bucket eviction,
 * sufficient for a single Next.js instance. See docs/deployment.md for the
 * multi-instance upgrade path.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>()
  private readonly maxBuckets: number
  private readonly idleTimeoutMs: number

  constructor(
    private readonly maxTokens: number,
    private readonly refillPerMs: number,
    options?: InMemoryRateLimitStoreOptions | number,
    idleTimeoutMs?: number,
  ) {
    if (typeof options === 'number') {
      this.maxBuckets = options
      this.idleTimeoutMs = idleTimeoutMs ?? Math.ceil(maxTokens / refillPerMs)
    } else {
      this.maxBuckets = options?.maxBuckets ?? 10_000
      this.idleTimeoutMs = options?.idleTimeoutMs ?? Math.ceil(maxTokens / refillPerMs)
    }
  }

  /**
   * Returns the current number of buckets stored in memory (used for tests and inspection).
   */
  getBucketCount(): number {
    return this.buckets.size
  }

  /**
   * Clears all rate limit buckets from memory (used for test isolation).
   */
  clear(): void {
    this.buckets.clear()
  }

  private evictStaleOrOverCapacity(now: number): void {
    // 1. Sweep stale/idle buckets that are fully refilled and idle for >= idleTimeoutMs
    this.buckets.forEach((bucket, key) => {
      const elapsedRefill = now - bucket.last
      const currentTokens = Math.min(
        this.maxTokens,
        bucket.tokens + Math.max(0, elapsedRefill) * this.refillPerMs,
      )
      const isFullyRefilled = currentTokens >= this.maxTokens
      const isIdle = now - bucket.lastAccess >= this.idleTimeoutMs

      if (isFullyRefilled && isIdle) {
        this.buckets.delete(key)
      }
    })

    // 2. Enforce hard maxBuckets cap via LRU eviction (front of Map is least recently accessed)
    while (this.buckets.size >= this.maxBuckets) {
      const oldestKey = this.buckets.keys().next().value
      if (oldestKey === undefined) break
      this.buckets.delete(oldestKey)
    }
  }

  async take(key: string, now: number): Promise<{ tokens: number; consumed: boolean }> {
    let bucket = this.buckets.get(key)

    if (!bucket) {
      this.evictStaleOrOverCapacity(now)
      bucket = { tokens: this.maxTokens, last: now, lastAccess: now }
      this.buckets.set(key, bucket)
    } else {
      // Re-insert key to maintain LRU access ordering (most recently accessed key is at the end)
      this.buckets.delete(key)
      this.buckets.set(key, bucket)

      // Refill based on elapsed time
      const elapsed = now - bucket.last
      if (elapsed > 0) {
        bucket.tokens = Math.min(this.maxTokens, bucket.tokens + elapsed * this.refillPerMs)
        bucket.last = now
      }
      bucket.lastAccess = now
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      return { tokens: bucket.tokens, consumed: true }
    }
    // not enough tokens — caller must wait for a full token to refill
    return { tokens: bucket.tokens, consumed: false }
  }
}

const WINDOW_MS = 60_000 // 1 minute
const MAX_TOKENS = 30 // 30 requests / minute per key
const REFILL_PER_MS = MAX_TOKENS / WINDOW_MS

// keyed by `${scope}:${id}` — e.g. "ip:1.2.3.4" or "wallet:GA…"
const defaultStore = new InMemoryRateLimitStore(MAX_TOKENS, REFILL_PER_MS)

/**
 * Resets internal rate limiter state for the default store (used for unit test isolation).
 */
export function resetRateLimitStateForTest(): void {
  defaultStore.clear()
}

/**
 * Returns the current bucket count of the store (defaults to defaultStore) for testing.
 */
export function getRateLimitBucketCountForTest(store: RateLimitStore = defaultStore): number {
  if (store instanceof InMemoryRateLimitStore) {
    return store.getBucketCount()
  }
  return 0
}

async function take(store: RateLimitStore, key: string): Promise<RateLimitResult> {
  const { tokens, consumed } = await store.take(key, Date.now())
  if (consumed) {
    return { limited: false, retryAfter: 0, remaining: Math.floor(tokens) }
  }
  const deficit = 1 - tokens
  const retryAfter = Math.ceil(deficit / REFILL_PER_MS / 1000)
  return { limited: true, retryAfter, remaining: 0 }
}

/**
 * Rate-limit a request by IP and (when present) wallet address.
 * Either key exceeding the limit triggers a 429.
 */
export async function rateLimitRequest(
  req: Request,
  address?: string | null,
  store: RateLimitStore = defaultStore,
): Promise<RateLimitResult> {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'

  const ipResult = await take(store, `ip:${ip}`)
  if (ipResult.limited) return ipResult

  if (address) {
    const walletResult = await take(store, `wallet:${address}`)
    if (walletResult.limited) return walletResult
  }

  return ipResult
}

