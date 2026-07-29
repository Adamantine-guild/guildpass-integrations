# httpOnly Cookie Migration

**Status:** Proposed  
**Requires:** `guildpass-core` coordination  
**Tracking:** See [issue #X](https://github.com/Adamantine-Guild/guildpass-integrations/issues/X)

---

## Problem

SIWE sessions are currently persisted as a bearer token in `sessionStorage`
(`lib/session.ts` → `guildpass:siwe-session`).  Any JavaScript running on the
page — including a malicious script injected via a dependency vulnerability or
reflected XSS — can read `window.sessionStorage` and exfiltrate the token,
enabling full admin session takeover.

## Target architecture

Replace the client-side bearer token with an **httpOnly, Secure, SameSite=Strict
session cookie** set by the backend on successful `/v1/auth/siwe/verify` and
`/v1/auth/siwe/refresh`.  The cookie is sent automatically by the browser on
every same-origin request and is **inaccessible to JavaScript**, eliminating the
XSS exfiltration vector.

```diff
- POST /v1/auth/siwe/verify → { token, address, expiresAt, ... }
+ POST /v1/auth/siwe/verify → { address, expiresAt, ... }
+                            Set-Cookie: gp_session=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600
```

---

## Backend contract changes (`guildpass-core`)

### 1. `POST /v1/auth/siwe/verify`

| Change | Detail |
|--------|--------|
| Response body | Remove the `token` field (keep `address`, `expiresAt`, `refreshToken`, `refreshExpiresAt` for backward-compat during migration) |
| New header | `Set-Cookie: gp_session=<signed-jwt>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=<access-token-ttl-seconds>` |

The cookie value should be a signed JWT containing at minimum:
- `sub` — the verified Ethereum address
- `exp` — access token expiry (matches the existing `expiresAt` field)

### 2. `POST /v1/auth/siwe/refresh`

Same pattern — rotate the cookie instead of returning a new `token` in the body.
The response body can continue to carry the new `expiresAt` / rotated
`refreshToken` for backward compatibility.

### 3. `POST /v1/auth/siwe/logout`

Clear the cookie:

```
Set-Cookie: gp_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0
```

### 4. Protected endpoints

Read the session from the `gp_session` cookie instead of the
`Authorization: Bearer` header.  During the dual-ship migration window,
check **both** the cookie and the header so old and new frontend builds
both work.

---

## Frontend changes (`guildpass-integrations`)

### Phase 1 — Dual ship (backward-compatible)

The backend still returns `token` in the `/verify` and `/refresh` response
bodies.  No frontend changes are needed yet; this phase verifies the cookie
path works end-to-end without risking a regression.

### Phase 1.5 — Dual-mode readiness (implemented)

Rather than a hard cutover, the frontend now supports **both** modes behind
`NEXT_PUBLIC_AUTH_MODE` (`bearer` default, `cookie` opt-in — see the
[README](../README.md#dual-mode-readiness-httponly-cookie-auth-next_public_auth_mode)).
`bearer` mode is byte-for-byte unchanged. `cookie` mode implements the target
architecture below, gated behind the flag, entirely against the mock (no
real `guildpass-core` endpoint exists yet):

| Module | What actually changed |
|--------|--------|
| `lib/config.ts` | New `config.authMode: 'bearer' \| 'cookie'`, parsed from `NEXT_PUBLIC_AUTH_MODE`. Any value other than the literal `cookie` falls back to `bearer`. |
| `lib/session.ts` | `storeAuthSession()`, `loadAuthSession()`, `loadAuthSessionIncludingExpired()`, and the `sessionStorage` branch of `clearAuthSession()` become no-ops in cookie mode — proven by unit tests that spy on `sessionStorage` call counts, not just return values. `getStoredToken()`/`getStoredAddress()` return `null` via the same gate. New `isSessionActive(): Promise<boolean>` calls the endpoint below. |
| `lib/api/types.ts` | New `SessionStatus { authenticated: boolean; address?: string; expiresAt?: string }` / `SessionStatusSchema` — provisional, like `AnalyticsSummary`. Added to `SiweAuthApi.getSessionStatus()`. `siweLogout(token?: string)` — token is now optional so a cookie-mode caller can invoke it with none. |
| `lib/api/live.ts` | `getSessionStatus()` calls `GET /v1/auth/session` (no live backend implements this yet — 404 is treated the same as "no session"). `authHeaders()` never adds `Authorization` when `authMode === 'cookie'`, regardless of whether a token is present in memory. `getJson()` sends `credentials: 'include'` only in cookie mode (needed because the core API can be cross-origin in dev — the browser's `same-origin` default excludes those cookies). The `token` constructor parameter was already optional; it stays. |
| `lib/api/mock.ts` | Mock `getSessionStatus()`/cookie simulation via a non-httpOnly `document.cookie` entry (mock JS cannot set a real httpOnly cookie either) — entirely separate storage from `sessionStorage`, active only when `authMode === 'cookie'`. |
| `lib/wallet/providers.tsx` | Mount hydration calls `getApi().getSessionStatus()` instead of reading `sessionStorage` when in cookie mode. Sign-in/refresh responses still legitimately carry a `token`/`refreshToken` from the backend during the dual-ship window, but the provider scrubs both to empty before the session is stored, dispatched, or broadcast, so a real token is never persisted or sent to a peer tab. |
| Call sites (`nav.tsx`, `app/**/page.tsx`) | **Unchanged.** `getApi(address, authSession?.token, communitySlug)` keeps its exact signature everywhere — in cookie mode `authSession.token` is simply `''`, which `authHeaders()` already ignores. This was a deliberate scope decision to avoid a 20-file diff for this PR; see "Known gaps" below for the follow-up once the backend endpoint ships. |

**Known gaps in this dual-mode-readiness pass** (tracked for the actual
Phase 2 cutover once `guildpass-core` ships `GET /v1/auth/session`):

- Cookie mode's silent refresh does **not** use the same Web-Locks-based
  cross-tab mutual exclusion bearer mode has
  (`lib/wallet/refresh-coordination.ts`) — it performs its own
  `siweRefresh()` call directly. Acceptable for now per the "tab sync
  becomes less critical" note below; two tabs racing a refresh at the exact
  same moment could redundantly both call the backend. Bearer mode's
  coordination is untouched.
- `getSessionStatus()` is unimplemented on the real `guildpass-core`
  backend — only the mock simulates it.

### Phase 2 — Switch to cookie (remaining work once the backend ships)

With the dual-mode plumbing above already in place, the remaining Phase 2
work is: `guildpass-core` implements `GET /v1/auth/session` and starts
setting the `gp_session` cookie; the frontend's default flips from `bearer`
to `cookie` (or ops sets `NEXT_PUBLIC_AUTH_MODE=cookie` per-environment);
and the cross-tab refresh coordination gap above gets closed.

### Phase 3 — Cleanup

Remove backward-compat `token` fields from the response body (backend) and
remove the dead code paths in the frontend (the bearer-mode branches in
`lib/session.ts` / `lib/wallet/providers.tsx` / `lib/api/live.ts` once
`bearer` mode is no longer supported).

---

## Migration sequence

```
Step 1: Backend ships cookie support (dual-ship — keep token in response body)
             │
Step 2: Frontend switches to cookie auth (Phase 2 above)
             │
Step 3: Backend removes token from response body
             │
Step 4: Frontend removes dead sessionStorage code (Phase 3)
```

Each step is independently deployable.  Steps 1 and 2 can ship in either order,
but both must be deployed before step 3.

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Cookie not sent on cross-origin requests | The admin API is same-origin (`NEXT_PUBLIC_CORE_API_URL` is called from the browser). `SameSite=Strict` is safe here. |
| Cookie not available in `localhost` dev | `Secure` requires HTTPS. In dev, fall back to `SameSite=Lax` without `Secure`, or document that devs must use `localhost` (which browsers treat as a secure context for cookies). |
| No JS-accessible token means no optimistic expiry clock | Replace `loadAuthSession().expiresAt` with the lightweight `/v1/auth/session` check. 401-driven expiry (the authoritative path) already works. |
| Multi-tab sync via BroadcastChannel | Tab sync becomes less critical because the cookie is shared by the browser's cookie jar across all same-origin tabs. On focus, each tab can re-check `/v1/auth/session` if needed. |
| Backend must sign and verify a new cookie | The backend already signs JWTs for the bearer token — the cookie variant uses the same signing key and format. |

---

## Interim mitigations (already shipped)

Until the cookie migration is complete, these defenses reduce XSS risk:

- **CSP headers** — `next.config.mjs` sets a strict `Content-Security-Policy`
  that constrains `connect-src`, blocks `eval`, frames, and objects.
- **Short access token TTL** — 1 hour limits the theft window.
- **Refresh token rotation** — a stolen refresh token is invalidated on first
  use by the legitimate client.
- **`getStoredToken()` isolation** — all token reads go through
  `lib/session.ts`; no component touches `sessionStorage` directly.
