/**
 * In-memory token-bucket rate limiter for the integration gateway routes.
 *
 * SINGLE-INSTANCE CAVEAT:
 * The bucket state lives in process memory. This is sufficient for a single
 * Next.js instance (one node/server process). If you run more than one
 * instance behind a load balancer, each instance keeps its own counters and
 * the effective limit is multiplied by the instance count. For multi-instance
 * or serverless (edge) deployments, replace the `Map` store with a shared
 * backend (e.g. Redis via @upstash/ratelimit, or a DB-backed counter) — see
 * docs/deployment.md "Production rate-limiting" for the upgrade path.
 */

export interface RateLimitResult {
  limited: boolean
  /** Seconds the caller must wait before retrying (0 when not limited). */
  retryAfter: number
  /** Requests remaining in the current window. */
  remaining: number
}

interface Bucket {
  tokens: number
  /** epoch ms of the last refill */
  last: number
}

const WINDOW_MS = 60_000 // 1 minute
const MAX_TOKENS = 30 // 30 requests / minute per key
const REFILL_PER_MS = MAX_TOKENS / WINDOW_MS

// keyed by `${scope}:${id}` — e.g. "ip:1.2.3.4" or "wallet:GA…"
const buckets = new Map<string, Bucket>()

function getBucket(key: string): Bucket {
  let bucket = buckets.get(key)
  const now = Date.now()
  if (!bucket) {
    bucket = { tokens: MAX_TOKENS, last: now }
    buckets.set(key, bucket)
    return bucket
  }
  // refill based on elapsed time
  const elapsed = now - bucket.last
  if (elapsed > 0) {
    bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + elapsed * REFILL_PER_MS)
    bucket.last = now
  }
  return bucket
}

function take(key: string): RateLimitResult {
  const bucket = getBucket(key)
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1
    return { limited: false, retryAfter: 0, remaining: Math.floor(bucket.tokens) }
  }
  // not enough tokens — caller must wait for a full token to refill
  const deficit = 1 - bucket.tokens
  const retryAfter = Math.ceil(deficit / REFILL_PER_MS / 1000)
  return { limited: true, retryAfter, remaining: 0 }
}

/**
 * Rate-limit a request by IP and (when present) wallet address.
 * Either key exceeding the limit triggers a 429.
 */
export function rateLimitRequest(
  req: Request,
  address?: string | null,
): RateLimitResult {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'

  const ipResult = take(`ip:${ip}`)
  if (ipResult.limited) return ipResult

  if (address) {
    const walletResult = take(`wallet:${address}`)
    if (walletResult.limited) return walletResult
  }

  return ipResult
}
