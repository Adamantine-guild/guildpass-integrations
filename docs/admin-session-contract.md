# Admin Session Contract

This document describes the authenticated session boundary for admin actions in the GuildPass frontend, and the backend contract that the live API integration depends on.

---

## Overview

Admin routes and privileged mutations require a SIWE (Sign-In with Ethereum, EIP-4361) session token.  
Wallet connection alone is **not** sufficient to perform mutations — the user must also sign a one-time, gasless off-chain message.

---

## Session Status States

The frontend maintains a granular `AdminSessionStatus` type (defined in `lib/api/types.ts`):

| Status | Meaning |
|--------|---------|
| `disconnected` | No wallet connected |
| `connected` | Wallet connected; SIWE sign-in not yet performed |
| `authenticating` | SIWE signature request is in-flight |
| `authenticated` | Valid, non-expired session token held |
| `expired` | A session was held but the token has since expired, or the backend rejected a mutation with 401 |

The status is exposed via `useSiweAuth().sessionStatus` and is derived from local state — no extra backend round-trip is needed.

---

## SIWE Sign-In Flow

```
1. User connects wallet (wagmi injected connector)
2. UI shows "Sign In" — no gas required
3. Frontend: POST /v1/auth/siwe/nonce  → { nonce: string }
4. EIP-4361 message built client-side (domain, statement, nonce, chainId, issuedAt)
5. wagmi signMessage → user approves in wallet
6. Frontend: POST /v1/auth/siwe/verify → { token, address, expiresAt }
7. Token stored in sessionStorage; auto-attached to admin mutations as
      Authorization: Bearer <token>
8. 401 from backend transitions sessionStatus to 'expired' and shows
   an inline re-auth banner — no page redirect
```

---

## XSS mitigation (interim)

The session token is stored in `sessionStorage` and is therefore readable by
any JavaScript running on the page — this is a known XSS exfiltration vector.
Until the httpOnly cookie migration (see [`http-only-cookie-migration.md`](./http-only-cookie-migration.md))
is complete, these defenses reduce risk:

| Mitigation | Detail |
|------------|--------|
| **CSP headers** | `next.config.mjs` sets a strict `Content-Security-Policy` that constrains `connect-src` to configured origins, blocks `eval()`, and disallows frames and plugins. |
| **Short access token TTL** | The access token expires after ~1 hour, limiting the window in which a stolen token is usable. |
| **Refresh token rotation** | Each refresh invalidates the previous refresh token, so a leaked refresh token is worthless after the first legitimate use. |
| **`lib/session.ts` isolation** | All `sessionStorage` access is confined to `lib/session.ts`; no component reads the storage directly. This enables a future swap to httpOnly cookies without touching call sites. |

See also: `docs/http-only-cookie-migration.md` for the full migration plan.

---

## Required Backend Endpoints (live mode only)

| Method | Path | Request body | Success response |
|--------|------|-------------|-----------------|
| `POST` | `/v1/auth/siwe/nonce` | `{ "address": "<0x…>" }` | `{ "nonce": "<hex string>" }` |
| `POST` | `/v1/auth/siwe/verify` | `{ "message": "<EIP-4361 text>", "signature": "<0x…>" }` | `{ "token": "<jwt>", "address": "<0x…>", "expiresAt": "<ISO 8601>" }` |
| `POST` | `/v1/auth/siwe/logout` | — (Bearer token in `Authorization` header) | `204 No Content` |

> In **mock mode** all three endpoints are simulated in-memory — no backend required.

### Field contract for `/v1/auth/siwe/verify`

| Field | Type | Notes |
|-------|------|-------|
| `token` | `string` | Opaque bearer token (e.g. JWT). Must be accepted by protected endpoints via `Authorization: Bearer`. |
| `address` | `string` | Ethereum address that was verified (checksummed or lowercase). Must match the address in the signed message. |
| `expiresAt` | `string` | ISO 8601 datetime. The frontend performs an optimistic client-side expiry check using this value; the backend should also enforce it. |

---

## Protected Admin Mutations

The following endpoints require a valid bearer token and must return `401 Unauthorized` when the token is missing, invalid, or expired:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/members/:address/roles` | Assign a role to a member |
| `PUT` | `/v1/policies/:resourceId` | Update an access policy |

When the frontend receives a `401` from any of these endpoints:
1. The mutation is rolled back optimistically.
2. `markExpired()` is called on `SiweAuthContext`, transitioning `sessionStatus` to `'expired'`.
3. An inline re-authentication banner is shown — the user can sign again without leaving the page.

---

## Expired Session Handling

The frontend detects expiry in two ways:

1. **Client-side (optimistic):** `lib/session.ts` checks `expiresAt` on load and immediately clears a stale token.
2. **Server-side (authoritative):** A `401` response from the backend triggers `markExpired()` via the mutation `onError` handler.

Both paths transition `sessionStatus` to `'expired'`, which causes:
- `AdminGuard` to render an `ExpiredSessionPrompt` instead of the protected content.
- `ConnectButton` to show a yellow "Session Expired" badge with a "Re-authenticate" button.

---

## Local Development — Simulating Auth States

Set `NEXT_PUBLIC_MOCK_SESSION_STATE` before starting the dev server:

```bash
# Simulate an expired session (admin mutations throw 401, siweVerify returns stale token)
NEXT_PUBLIC_MOCK_MODE=true NEXT_PUBLIC_MOCK_SESSION_STATE=expired npm run dev

# Simulate unauthenticated state (siweVerify always fails)
NEXT_PUBLIC_MOCK_MODE=true NEXT_PUBLIC_MOCK_SESSION_STATE=unauthenticated npm run dev

# Normal mock mode (instant auth, 1-hour token)
NEXT_PUBLIC_MOCK_MODE=true npm run dev
```

See `.env.example` for the full list of environment variables.
