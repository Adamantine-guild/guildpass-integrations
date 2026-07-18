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
