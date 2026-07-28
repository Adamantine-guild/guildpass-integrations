/**
 * GuildPass Service Worker — Dashboard Offline Cache
 *
 * Strategy: stale-while-revalidate for read-only member dashboard API routes.
 *
 * Security constraints (MUST hold):
 *   1. Never cache any request that carries an Authorization: Bearer header.
 *      Caching SIWE tokens would risk leaking credentials into shared caches.
 *   2. Never cache admin mutation routes (/v1/admin/*, POST, PUT, DELETE).
 *   3. Admin route prefixes are matched by URL path, not just method, so a
 *      future GET /v1/admin/foo is also excluded.
 *   4. SIWE auth endpoints (/v1/auth/siwe/*) are excluded entirely.
 *   5. Only GET requests to explicitly allow-listed path prefixes are cached.
 *
 * Cache management:
 *   - Cache name includes a version suffix; old caches are pruned on activate.
 *   - Each cached entry carries an X-Cache-Timestamp response header.
 *   - Entries older than MAX_AGE_MS are treated as expired and the network is
 *     used directly (cache miss). This prevents unbounded staleness.
 *   - Cache is kept under MAX_ENTRIES entries per eviction sweep (LRU-lite:
 *     oldest-first delete).
 */

const CACHE_NAME = 'guildpass-dashboard-v1';

/** 7 days in ms — entries older than this are not served from cache. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Maximum number of entries stored in the cache before eviction. */
const MAX_ENTRIES = 50;

/**
 * URL path prefixes that are eligible for caching.
 * Only GET requests whose pathname STARTS WITH one of these prefixes will be
 * cached. Everything else (admin, auth, mutations) is passed through untouched.
 *
 * Keeping this list explicit (allow-list) is safer than a deny-list because
 * new admin endpoints added in the future are excluded by default.
 */
const CACHEABLE_PREFIXES = [
  '/v1/session',
  '/v1/community',
  '/v1/resources',
  '/v1/policies',
  '/v1/members/',       // member profile reads: /v1/members/:addr/profile
  '/api/integration/membership',
  '/api/integration/verify',
  '/api/integration/health',
];

/**
 * Path prefixes that are ALWAYS excluded, even if they would otherwise match
 * a cacheable prefix. Admin and auth surfaces must never be cached.
 */
const EXCLUDED_PREFIXES = [
  '/v1/admin/',
  '/v1/auth/',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true if this request should be handled by the stale-while-revalidate
 * cache logic.
 *
 * @param {Request} request
 */
function isCacheable(request) {
  // Only GET requests
  if (request.method !== 'GET') return false;

  // Skip cross-origin requests (only cache same-origin API calls)
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }

  if (url.origin !== self.location.origin) return false;

  const path = url.pathname;

  // Never cache requests carrying a Bearer token — this is the most important
  // security constraint. Admin sessions use Bearer tokens; member read-only
  // calls do not send Authorization headers.
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) return false;

  // Exclude admin and auth paths
  for (const prefix of EXCLUDED_PREFIXES) {
    if (path.startsWith(prefix)) return false;
  }

  // Must match an explicitly allowed prefix
  for (const prefix of CACHEABLE_PREFIXES) {
    if (path.startsWith(prefix)) return true;
  }

  return false;
}

/**
 * Attach a timestamp header to a Response so we can measure freshness later.
 * Clones the response (responses are single-use streams).
 *
 * @param {Response} response
 * @returns {Response}
 */
function stampedResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Cache-Timestamp', String(Date.now()));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Returns true if the cached response is within MAX_AGE_MS.
 *
 * @param {Response} cached
 */
function isFresh(cached) {
  const ts = cached.headers.get('X-Cache-Timestamp');
  if (!ts) return false;
  return Date.now() - Number(ts) < MAX_AGE_MS;
}

/**
 * Evict oldest entries when the cache exceeds MAX_ENTRIES.
 *
 * @param {Cache} cache
 */
async function evictIfNeeded(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;

  // Sort by X-Cache-Timestamp ascending (oldest first)
  const withTs = await Promise.all(
    keys.map(async (req) => {
      const res = await cache.match(req);
      const ts = res ? Number(res.headers.get('X-Cache-Timestamp') || '0') : 0;
      return { req, ts };
    }),
  );

  withTs.sort((a, b) => a.ts - b.ts);

  const toDelete = withTs.slice(0, keys.length - MAX_ENTRIES);
  await Promise.all(toDelete.map(({ req }) => cache.delete(req)));
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  // Skip waiting so the new SW activates immediately rather than waiting for
  // all existing tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Claim all clients immediately so this SW controls existing tabs.
      await self.clients.claim();

      // Prune caches from old SW versions.
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
    })(),
  );
});

// ── Fetch interception ────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  if (!isCacheable(event.request)) {
    // Pass through: mutations, admin routes, Bearer-authenticated requests,
    // cross-origin, non-GET, and any other uncacheable request.
    return;
  }

  event.respondWith(handleCacheableRequest(event.request));
});

/**
 * Stale-while-revalidate handler.
 *
 * 1. Open the cache.
 * 2. If a fresh cached response exists, return it immediately and kick off a
 *    background network fetch to update the cache.
 * 3. If the cached response is stale or absent, fetch from network:
 *    - On success: cache the fresh response and return it.
 *    - On network failure: return the stale cached response if one exists
 *      (degraded-but-useful offline mode), otherwise propagate the error.
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleCacheableRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached && isFresh(cached)) {
    // Serve from cache immediately; refresh in background.
    refreshInBackground(cache, request);
    return cached.clone();
  }

  // Cache miss or stale — try network first.
  try {
    const networkResponse = await fetch(request.clone());

    if (networkResponse.ok) {
      const toStore = stampedResponse(networkResponse.clone());
      // Store and evict asynchronously — don't block the response.
      cache.put(request, toStore).then(() => evictIfNeeded(cache));
    }

    return networkResponse;
  } catch {
    // Network failure — fall back to stale cache if available.
    if (cached) {
      return cached.clone();
    }
    // No cache, no network — propagate so React Query shows its error state.
    throw new TypeError('Network request failed and no cached response available.');
  }
}

/**
 * Fire-and-forget background refresh. Errors are swallowed since the client
 * has already received a cached response.
 *
 * @param {Cache} cache
 * @param {Request} request
 */
function refreshInBackground(cache, request) {
  fetch(request.clone())
    .then(async (response) => {
      if (!response.ok) return;
      const toStore = stampedResponse(response);
      await cache.put(request, toStore);
      await evictIfNeeded(cache);

      // Notify all controlled clients that fresh data is available so the
      // sync-status indicator can update its "last updated" timestamp.
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.postMessage({
          type: 'CACHE_UPDATED',
          url: request.url,
          timestamp: Date.now(),
        });
      }
    })
    .catch(() => {
      // Background refresh failed — the cached version already served is fine.
    });
}
