# Refresh Token Backend Contract

> **Status: Proposed — pending implementation in `guildpass-core`**  
> This document specifies the exact contract that `guildpass-core` must
> implement to enable silent session renewal on the frontend (issue #166).
> The client side (including mock mode) is already fully implemented and
> testable without this endpoint.

---

## Background

The existing session model issues a single short-lived access token on sign-in
(`/v1/auth/siwe/verify`).  When the token expires the admin must produce a new
EIP-4361 wallet signature — a real UX cost for sustained work.

This document extends that model with a **refresh token** that allows the
frontend to silently renew the access token without a new wallet signature.

---

## Token model

| Token | Lifetime | Storage | Purpose |
|-------|----------|---------|---------|
| **Access token** | ~1 hour | `sessionStorage` (tab-scoped) | `Authorization: Bearer` on admin mutations |
| **Refresh token** | ~7 days | `sessionStorage` (tab-scoped) | Exchange for a new access + refresh pair |

Both tokens are tab-scoped by design.  Closing a tab discards both, which
limits the blast radius of a shared-device compromise.

The frontend never sends the refresh token to the backend as a `Bearer`
header — it is sent only in the body of `POST /v1/auth/siwe/refresh`.

---

## New endpoint: `POST /v1/auth/siwe/refresh`

### Request

```
POST /v1/auth/siwe/refresh
Content-Type: application/json

{
  "refreshToken": "<opaque string issued by /v1/auth/siwe/verify>"
}
```

No `Authorization` header is required on this endpoint.

### Success response — `200 OK`

```json
{
  "token":            "<new short-lived access token>",
  "address":          "<0x… checksummed or lowercase>",
  "expiresAt":        "<ISO 8601 — access token expiry, ~1 h from now>",
  "refreshToken":     "<new opaque refresh token — ROTATED>",
  "refreshExpiresAt": "<ISO 8601 — refresh token expiry, ~7 d from now>"
}
```

**Token rotation is mandatory.** Every successful refresh must issue a new
refresh token and invalidate the one that was presented.  The client always
stores the newest token and discards the previous one.

### Error responses

| HTTP | Body `code` | Trigger |
|------|-------------|---------|
| `400 Bad Request` | `bad_request` | Body missing, not JSON, or `refreshToken` field absent |
| `401 Unauthorized` | `unauthorized` | Refresh token expired, already used, or not found |
| `429 Too Many Requests` | `rate_limited` | Excessive refresh attempts from same address |

#### 401 response body example

```json
{
  "code":    "unauthorized",
  "message": "Refresh token expired or invalid."
}
```

A `401` tells the client that silent renewal is impossible and the user must
sign again with their wallet.

---

## Updated response for `POST /v1/auth/siwe/verify`

The verify endpoint must now return the refresh token alongside the access
token.  Existing clients that do not read `refreshToken` / `refreshExpiresAt`
are unaffected (the new fields are additive).

```json
{
  "token":            "<short-lived access token>",
  "address":          "<0x…>",
  "expiresAt":        "<ISO 8601 — ~1 h>",
  "refreshToken":     "<longer-lived refresh token>",
  "refreshExpiresAt": "<ISO 8601 — ~7 d>"
}
```

---

## Token rotation and invalidation semantics

1. **One-time use.** A refresh token is valid for exactly one use.  After
   a successful `/v1/auth/siwe/refresh` call the presented token is
   immediately invalidated and the returned token is the new credential.

2. **Cascade invalidation.** A logout (`POST /v1/auth/siwe/logout`) must
   invalidate both the access token and any outstanding refresh tokens for
   that address.

3. **Replay detection.** If a refresh token is presented a second time after
   already being used, the backend should treat this as a potential token
   theft event and invalidate **all** refresh tokens for the associated
   address (total session revocation).

4. **Storage.** Refresh tokens must be stored server-side (e.g. in a database
   table indexed by token hash) so they can be individually invalidated.
   A stateless JWT-only approach is not sufficient for the rotation +
   invalidation semantics described here.

5. **Expiry enforcement.** The backend must enforce `refreshExpiresAt`
   independently of the client-side check.  The frontend performs an
   optimistic client-side guard but must not be trusted as the sole
   enforcement layer.

---

## Multi-tab behaviour (frontend — no backend changes required)

The frontend uses the `BroadcastChannel` API (channel name `guildpass:auth`)
to propagate auth state across same-origin tabs.  This is entirely client-side
and does not require any backend changes.

| Event | When | What peer tabs do |
|-------|------|--------------------|
| `signed-in` | After a successful `/v1/auth/siwe/verify` | Write session to sessionStorage and authenticate |
| `refreshed` | After a successful `/v1/auth/siwe/refresh` | Update access token in sessionStorage |
| `signed-out` | After logout or 401-triggered expiry | Clear session and show re-auth prompt |
| `request-current-session` | Sent by a tab that detects (via the localStorage marker below) that a peer refreshed but never received that peer's `refreshed` message | Any tab holding a valid session for that address re-broadcasts `refreshed` |

Because each tab runs its own `SiweAuthProvider` instance, two tabs can
independently enter the proactive renewal window (60 s before access-token
expiry) and both attempt to redeem the same **one-time-use** refresh token
before either observes the other's `BroadcastChannel` message. The refresh
path (`lib/wallet/refresh-coordination.ts`, driven from
`lib/wallet/providers.tsx`) adds three layers on top of `BroadcastChannel` to
prevent that race:

### Web Locks coordination

The network call to `POST /v1/auth/siwe/refresh` is wrapped in
`navigator.locks.request()`, scoped per wallet address
(`guildpass:siwe-refresh:<address>`). At most one same-origin tab holds the
lock for a given address at a time, so at most one tab is ever mid-flight on
the refresh call for that address; any other tab that reaches its renewal
window for the same address queues behind the lock instead of firing a
concurrent request.

### Adopting a peer's refreshed session

A tab that was queued behind the lock does **not** blindly replay its refresh
token once the lock is granted — that token may already have been rotated
away by the peer that held the lock first. Before calling the API it:

1. Re-reads the stored session and checks whether it is now newer than the
   session snapshot this attempt started with (different `expiresAt` /
   `refreshToken`, and not itself expired). If so, it adopts that session
   directly — no network call.
2. If storage hasn't caught up yet — a peer's `refreshed` message can be
   **missed entirely**, not just delayed, if it was sent before this tab's
   `BroadcastChannel` listener existed (e.g. the winner finishes in a
   handful of milliseconds while this tab is still mid-navigation) — the tab
   sends `request-current-session` and briefly polls storage for any peer's
   response, rather than assuming it must perform its own call.
3. Only if neither step yields a fresh session does the tab call
   `siweRefresh()` itself, store the result, and broadcast `refreshed`.

This adoption path also runs when Web Locks is unavailable (see below), so a
tab that loses an unlocked race can still recover a peer's result instead of
presenting an already-invalidated token.

A small `localStorage` marker (timestamp of the last successful refresh per
address — never the token itself) backs step 1/2 above: unlike
`BroadcastChannel` messages, `localStorage` writes are synchronously visible
to other same-origin tabs regardless of listener timing, so it reliably tells
a queued tab *that* a peer refreshed even when it missed the message saying
so.

### Bounded fallback when the leader disappears

The wait for a peer's response (`request-current-session` → `refreshed`) is
bounded — by default a 2 second timeout, polling storage every 25 ms. If the
tab that completed the refresh (or held the lock) closes or navigates away
before a waiting tab observes the result — e.g. every peer holding the fresh
session closed its tab — the wait times out and the queued tab falls back to
performing its own `siweRefresh()` call. A stuck or vanished leader tab can
therefore never wedge session renewal in the tabs that survive it.

### Graceful degradation without Web Locks or BroadcastChannel

Both coordination primitives are optional; their absence degrades safety
without breaking functionality:

- **No Web Locks** (`navigator.locks` undefined): `withRefreshLock` runs the
  refresh operation directly instead of acquiring a lock. Same-tab exclusion
  (the existing `isRefreshing` ref) still prevents duplicate calls within one
  tab, and the peer-adoption check above still lets a tab that loses an
  unlocked race adopt the winner's session — but multiple tabs can now
  concurrently *attempt* the network call, relying on the backend's one-time-use
  enforcement (see below) to make any redundant attempt fail safely as a 401
  rather than a security issue.
- **No `BroadcastChannel`** (checked via `"BroadcastChannel" in window`): the
  provider skips wiring up the channel entirely. Cross-tab propagation of
  `signed-in` / `refreshed` / `signed-out` and the `request-current-session`
  handshake do not happen, so each tab manages its own session independently
  and only learns of a peer's rotation the next time it reads
  `sessionStorage` on its own schedule (e.g. its own renewal timer). Within a
  single tab, refresh behaviour is unaffected.

In both degraded cases, no tab presents a refresh token it already knows to
be stale — the remaining risk is redundant network calls, not incorrect
token reuse, and that risk is bounded by the backend contract below.

### Backend contract is unchanged

None of this cross-tab coordination changes the backend contract described
above. The refresh token is still **one-time-use**
(see [Token rotation and invalidation semantics](#token-rotation-and-invalidation-semantics)):
if degraded conditions ever let two tabs present the same refresh token, the
backend's existing 401 (`unauthorized`) response for an already-used token is
what makes the loser's attempt fail safely — the frontend coordination above
exists purely to make that case rare, not to replace the backend's
enforcement of it.

---

## Security notes

- The refresh token must be treated as a **secret**.  It must never appear in
  logs, URLs, or response headers.  It should be sent only as a JSON body
  field over HTTPS.
- The frontend stores the refresh token only in `sessionStorage`.  This is
  intentional: it is automatically cleared when the tab (or browser) is
  closed, limiting the window of exposure.
- Do not accept refresh tokens over HTTP in production.

---

## Affected files (frontend — already implemented)

| File | Change |
|------|--------|
| `lib/api/types.ts` | `SiweAuthSession` extended with `refreshToken?` / `refreshExpiresAt?`; `SiweAuthApi` extended with `siweRefresh()` |
| `lib/session.ts` | `loadAuthSessionIncludingExpired()`, `isRefreshTokenExpired()`, `msUntilRenewal()` helpers added |
| `lib/api/mock.ts` | `siweVerify()` returns mock refresh token; `siweRefresh()` implemented with rotation and 401 simulation |
| `lib/api/live.ts` | `siweRefresh()` implemented — calls `POST /v1/auth/siwe/refresh` |
| `lib/wallet/providers.tsx` | Silent renewal timer, `performSilentRefresh()`, BroadcastChannel multi-tab sync |

---

## Testing in mock mode

The entire refresh path is exercisable without `guildpass-core`:

```bash
# Normal mock mode — sign in, observe silent renewal after ~1 hour
NEXT_PUBLIC_MOCK_MODE=true npm run dev
```

To test the expiry → re-auth flow:

```bash
# Access token is issued already-expired but refresh token is valid.
# The provider should immediately attempt siweRefresh and succeed.
NEXT_PUBLIC_MOCK_MODE=true NEXT_PUBLIC_MOCK_SESSION_STATE=expired npm run dev
```

Mock refresh tokens are prefixed `mock-refresh-` so the mock `siweRefresh()`
can identify them without cryptography.

---

## Related documents

- [docs/admin-session-contract.md](./admin-session-contract.md) — existing SIWE sign-in contract
- [docs/architecture.md](./architecture.md) — full system architecture including auth flow
