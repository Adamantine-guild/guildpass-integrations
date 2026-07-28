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

### Phase 2 — Switch to cookie

| Module | Change |
|--------|--------|
| `lib/session.ts` | Remove all `sessionStorage` read/write/clear logic. `storeAuthSession()`, `loadAuthSession()`, `clearAuthSession()` become no-ops or thin wrappers around a new session-status check. `getStoredToken()` returns `null` — the token is no longer accessible to JS. |
| `lib/session.ts` — new | Add `isSessionActive(): Promise<boolean>` that calls `GET /v1/auth/session` (or similar lightweight endpoint that returns `{ authenticated: true/false }`). This replaces the client-side expiry check. |
| `lib/api/live.ts` | Remove `authHeaders()` entirely — the cookie is sent automatically by the browser. `LiveAccessApi` no longer needs the `token` constructor parameter. |
| `lib/api/index.ts` | `getApi()` no longer takes a `token` argument. |
| `lib/wallet/providers.tsx` | `SiweAuthProvider` no longer hydrates from `sessionStorage` on mount. Auth status is determined by calling `isSessionActive()`. Silent refresh still triggers `siweRefresh()` but the new cookie is set by the backend automatically. |
| All call sites | Remove `authSession?.token` from `getApi(...)` calls in `nav.tsx`, `app/admin/*/page.tsx`. The constructor parameter is gone; the cookie is transparent. |

### Phase 3 — Cleanup

Remove backward-compat `token` fields from the response body (backend) and
remove the dead code paths in the frontend.

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
