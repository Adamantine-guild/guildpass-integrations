# Deployment

## Integration gateway rate limiting

The `/api/integration/membership` and `/api/integration/verify` route handlers
are protected by an in-memory token-bucket rate limiter
(see `lib/rate-limit.ts`). The default configuration allows **30 requests per
minute** per client, keyed by:

- the request IP (from `x-forwarded-for` / `x-real-ip`), and
- the `address` query parameter (when present).

When either key exceeds the limit the route returns `429 Too Many Requests`
with a `Retry-After` header (seconds) and an `X-RateLimit-Remaining` header.

### Single-instance caveat

The token bucket state is held in **process memory** (`Map`). This is correct
and sufficient for a **single Next.js instance** (one server process). Under
this deployment the effective limit is exactly the configured 30 req/min per
key.

### Production / multi-instance upgrade path

If you run **more than one instance** (horizontal scaling, containers behind a
load balancer) or a **serverless / edge** runtime, each process keeps its own
counters, so the effective limit is multiplied by the number of instances and
state is lost on cold starts. To keep a true global limit, replace the in-memory
`Map` store in `lib/rate-limit.ts` with a shared backend:

- **Redis (recommended):** `@upstash/ratelimit` + `@upstash/redis`, or
  `ioredis` with a Lua token-bucket script for atomic decrement.
- **Database counter:** a small row per key with `UPDATE … SET tokens = …`
  guarded by a transaction.
- **Edge KV:** `@vercel/kv` or Cloudflare Workers KV with a TTL-backed counter.

The `rateLimitRequest()` signature stays the same — only the bucket store
behind `getBucket()` / `take()` needs to be swapped for a shared implementation.
