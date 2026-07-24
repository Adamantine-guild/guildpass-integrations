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

## Troubleshooting

### `NEXT_PUBLIC_CORE_API_URL` is invalid or missing

`lib/config.ts` validates this variable eagerly at module-import time when
running in live mode (`NEXT_PUBLIC_MOCK_MODE` / `NEXT_PUBLIC_DEMO_MODE` not
set to `true`). If it's missing or not a syntactically valid absolute URL,
the app throws a `ConfigError` that names the variable, what's wrong with it,
and how to fix it (either set a valid URL or switch to mock mode).

Because this happens at module-import time, it surfaces as a **build or
server-startup failure** — you'll see it in your build logs or server console,
not as an in-app page. There is currently no custom Next.js error page for
this case, so depending on your environment you may see a raw stack trace
rather than formatted output. If your deploy fails immediately with a
`ConfigError` mentioning `NEXT_PUBLIC_CORE_API_URL`, check the exact variable
value in your environment/deployment configuration against the message —
it will tell you exactly what's wrong.

### `NEXT_PUBLIC_CORE_API_URL` is valid but unreachable

If the URL is well-formed but points at a backend that isn't actually
reachable (wrong host, backend not running, network/firewall issue), the app
will still build and start — this failure mode only shows up at runtime.

On load, a one-time health check (`ensureOnline()` in
`lib/api/backendStatus.ts`) pings `<NEXT_PUBLIC_CORE_API_URL>/healthz`. If it
fails, a banner appears at the top of the app reading *"Can't reach the
backend service"* and pointing at `NEXT_PUBLIC_CORE_API_URL` as the likely
cause — distinct from the generic "you're offline" banner shown when the
user's own browser has no network connection. The banner clears
automatically once the backend becomes reachable again.

If you see this banner:
- Confirm `NEXT_PUBLIC_CORE_API_URL` points at the correct host for this
  environment (staging vs. production backends are a common mismatch).
- Confirm the backend is actually running and its `/healthz` endpoint
  responds with a 2xx status.
- Check for network-level blockers (VPN, firewall, CORS) between the
  deployed frontend and the backend.
