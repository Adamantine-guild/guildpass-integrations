# SIWE Authentication & Token Lifecycle Threat Model

This document provides a formal, end-to-end security threat model for the Sign-In with Ethereum (SIWE, EIP-4361) authentication implementation and token lifecycle in `guildpass-integrations`.

---

## 1. Overview & System Scope

The GuildPass frontend application manages admin authentication through off-chain EIP-4361 signatures. After wallet connection and signature verification, the application obtains a short-lived access token and a refresh token, enabling privilege-gated access to community administration functions.

This threat model evaluates the frontend authentication architecture across three distinct trust boundaries, identifying potential threat vectors, risk severity ratings, concrete defenses, and accepted residual risks.

---

## 2. Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Trust Boundary 1: Client Browser Runtime                                   │
│                                                                             │
│  ┌──────────────────┐    ┌─────────────────┐    ┌────────────────────────┐  │
│  │ React App & DOM  │───>│  lib/session.ts │───>│ sessionStorage         │  │
│  │ (providers.tsx)  │    │  (helpers)      │    │ (guildpass:siwe-sess)  │  │
│  └──────────────────┘    └─────────────────┘    └────────────────────────┘  │
│            ▲                                                                │
│            │ BroadcastChannel ('guildpass:auth')                            │
│            ▼                                                                │
│  ┌──────────────────┐                                                       │
│  │ Peer Browser Tab │                                                       │
│  └──────────────────┘                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ HTTPS Fetch / JSON-RPC
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Trust Boundary 2: Next.js Integration Gateway (Server-Side)                 │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ /api/integration/* Route Handlers                                     │  │
│  │ - CSRF Check via validateIntegrationGatewayCsrf()                      │  │
│  │ - Server-only INTEGRATION_API_KEY header attachment                    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ Upstream HTTPS
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Trust Boundary 3: External Backend & Wallet Infrastructure                  │
│                                                                             │
│  ┌────────────────────────┐  ┌───────────────────────┐  ┌───────────────┐ │
│  │ guildpass-core API     │  │ Web3 RPC Endpoints    │  │ Wallet Provider│ │
│  │ (/v1/auth/siwe/*)      │  │ (Ethereum / Base)     │  │ (wagmi / viem)│ │
│  └────────────────────────┘  └───────────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Trust Boundary Definitions

1. **Trust Boundary 1: Client Browser Runtime**
   - **Scope:** DOM execution context, React component tree, `SiweAuthProvider` (`lib/wallet/providers.tsx`), storage helpers (`lib/session.ts`), `sessionStorage`, and inter-tab `BroadcastChannel`.
   - **Assumptions:** Un-authenticated or malicious scripts executing within the same origin (via XSS or third-party package compromise) share full access to the DOM and `sessionStorage`.

2. **Trust Boundary 2: Integration Gateway (Server Route Handlers)**
   - **Scope:** Next.js server-side API routes under `/api/integration/*`.
   - **Assumptions:** Server execution environment is secure, but route handlers receive untrusted HTTP requests from external clients and browsers.

3. **Trust Boundary 3: External Backend & Wallet Provider Layer**
   - **Scope:** `guildpass-core` backend API, Ethereum JSON-RPC nodes, and browser wallet extensions (MetaMask, Rabby, etc.).
   - **Assumptions:** Transports use TLS/HTTPS; external backends validate signatures independently.

---

## 3. Attacker Personas & Capabilities

| Persona | Description | Capabilities |
|---------|-------------|--------------|
| **XSS Attacker** | Malicious script executing inside the browser origin (e.g. injected via dependency or stored XSS). | Reads `sessionStorage`, invokes global JS functions, dispatches custom DOM events, triggers unauthorized HTTP requests within user's session context. |
| **Cross-Site Attacker** | Malicious third-party website visited by an authenticated admin. | Attempts cross-site request forgery (CSRF), clickjacking in `<iframe>`, or cross-origin timing/framing attacks. |
| **Network Attacker** | Active or passive adversary on local network / Wi-Fi. | Eavesdrops on unencrypted HTTP traffic, attempts TLS downgrade, or tampers with unencrypted RPC calls. |
| **Malicious Tab / Extension** | Compromised same-origin browser tab or malicious browser extension. | Intercepts `BroadcastChannel` messages, attempts to push spoofed auth states, or intercepts `window.ethereum` calls. |

---

## 4. Vulnerability Matrix & Threat Evaluation

### Summary Matrix

| ID | Threat Vector | Category | Rating | Status | Primary Defense / Mitigation |
|---|---|---|---|---|---|
| **TM-01** | XSS Token Theft from `sessionStorage` | Information Disclosure / Hijacking | **High** | Accepted Risk / Mitigated | Strict CSP, short access token TTL (1h), refresh token rotation, code isolation in `lib/session.ts`. Pending httpOnly cookie migration (#166). |
| **TM-02** | Session Fixation & Address Switching Anomalies | Session Hijacking | **Medium** | Fixed | Mandatory address mismatch check, single-use nonces, `BroadcastChannel` structural validation. |
| **TM-03** | CSRF on Integration Gateway Routes | Request Forgery | **Medium** | Fixed | `validateIntegrationGatewayCsrf()` origin/referer verification on non-safe methods (`POST`, `PUT`). |
| **TM-04** | Bearer Token Admin Mutation Forgery | Request Forgery | **Low** | Fixed / Inherently Safe | Custom `Authorization: Bearer` header cannot be automatically attached by browsers on cross-site requests. |
| **TM-05** | MitM & Transport Eavesdropping | Eavesdropping | **Medium** | Fixed | Mandatory TLS/HTTPS, `Strict-Transport-Security` (HSTS), RPC protocol enforcement in `buildConnectSrc()`. |
| **TM-06** | Cross-Site Framing & Clickjacking | UI Redress | **Medium** | Fixed | `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`. |
| **TM-07** | Inter-Tab Eavesdropping & Broadcast Channel Spoofing | Spoofing / Tampering | **Medium** | Fixed | Schema validation & connected wallet address verification in `SiweAuthProvider` BroadcastChannel handler. |
| **TM-08** | SIWE Signature Replay & Domain Spoofing | Replay / Spoofing | **Medium** | Fixed | Strict EIP-4361 domain validation (`NEXT_PUBLIC_SIWE_DOMAIN`), server single-use nonces with 5-minute TTL. |

---

## 5. Detailed Threat Analysis & Mitigation Strategies

### TM-01: XSS Token Theft from `sessionStorage`
- **Description:** Any cross-site script execution vulnerability within the web application can access `window.sessionStorage.getItem('guildpass:siwe-session')` and exfiltrate the raw JWT access token and refresh token to an attacker-controlled server.
- **Risk Severity:** **High**
- **Mitigation Controls Implemented:**
  - **Strict CSP Headers (`next.config.mjs`):** Limits `script-src` and `connect-src` destinations, eliminating dynamic script injection and unauthorized exfiltration endpoints.
  - **Short Access Token TTL:** Access tokens expire after 1 hour (`expiresAt`), limiting the validity window of an exfiltrated access token.
  - **Refresh Token Rotation:** `siweRefresh()` invalidates the previous refresh token upon use. If an attacker attempts to use a stolen refresh token after the legitimate user has refreshed, the backend revokes the session.
  - **Isolated Storage Access (`lib/session.ts`):** `sessionStorage` interactions are strictly centralized in `lib/session.ts` and `lib/wallet/providers.tsx`. Components never read `sessionStorage` directly.
- **Accepted Risk Rationale:** `sessionStorage` is inherently accessible to all JavaScript executing in the same origin. Until the backend supports httpOnly cookies (tracked under issue #166 and documented in [`docs/http-only-cookie-migration.md`](../http-only-cookie-migration.md)), client-side bearer token storage remains an accepted interim trade-off protected by CSP and short token lifetimes.

### TM-02: Session Fixation & Address Switch Anomalies
- **Description:** An attacker attempts to trick an admin user into retaining or adopting an authenticated session belonging to a different wallet address (e.g. switching connected wallets in MetaMask while maintaining an active SIWE session for a previous admin account).
- **Risk Severity:** **Medium**
- **Mitigation Controls Implemented:**
  - `SiweAuthProvider` continuously monitors `useAccount().address` and `isConnected`.
  - When the connected wallet address changes or disconnects, `SiweAuthProvider` instantly clears `sessionStorage` via `clearAuthSession()`, cancels renewal timers, resets internal state to `disconnected`/`unauthenticated`, and broadcasts a `signed-out` event across peer tabs.
  - Nonces generated during sign-in (`POST /v1/auth/siwe/nonce`) are single-use and bound to the target address on the core API side.

### TM-03: CSRF on Integration Gateway Routes (`/api/integration/*`)
- **Description:** A malicious website sends cross-site HTTP requests (`POST`/`PUT`) to the local server route handlers at `/api/integration/*`, attempting to execute privileged actions using the server's `INTEGRATION_API_KEY`.
- **Risk Severity:** **Medium**
- **Mitigation Controls Implemented:**
  - Mutation route handlers call `validateIntegrationGatewayCsrf(req)` (`lib/csrf.ts`).
  - Rejects cross-origin `Origin` or `Referer` headers for state-changing HTTP methods (`POST`, `PUT`, `DELETE`, `PATCH`).
  - Allowed origin is strictly validated against `INTEGRATION_ALLOWED_ORIGIN` or `NEXT_PUBLIC_SIWE_DOMAIN`.
  - Safe read-only methods (`GET`, `HEAD`, `OPTIONS`) bypass CSRF checks.

### TM-04: CSRF Considerations for Direct Bearer Token Mutations
- **Description:** Attacker site attempts to forge cross-site requests directly to `guildpass-core` backend endpoints.
- **Risk Severity:** **Low**
- **Mitigation Controls Implemented:**
  - Privileged mutations to `guildpass-core` are authenticated via custom HTTP headers (`Authorization: Bearer <token>`).
  - Standard browsers **never** automatically attach custom headers to cross-site HTML form submissions, `<img>`, `<iframe>`, or simple cross-origin fetch/XHR requests.
  - Preflight CORS requests (`OPTIONS`) enforced by browsers block unauthorized cross-origin requests requiring custom headers unless explicitly allowed by CORS policy.

### TM-05: Transport Security & MitM Attacks
- **Description:** Adversary on local network inspects or modifies API requests, SIWE signatures, or Web3 RPC calls.
- **Risk Severity:** **Medium**
- **Mitigation Controls Implemented:**
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` header configured in `next.config.mjs`.
  - `NEXT_PUBLIC_CORE_API_URL` validation in `lib/config.ts` requires absolute valid URLs.
  - `buildConnectSrc()` in `next.config.mjs` restricts network protocols to secure origins (`https://` and `wss://` RPC origins in production).

### TM-06: Cross-Site Framing & Clickjacking
- **Description:** Attacker embeds GuildPass admin dashboard inside a transparent `<iframe>` on a malicious site to trick admins into clicking privileged action buttons.
- **Risk Severity:** **Medium**
- **Mitigation Controls Implemented:**
  - `X-Frame-Options: DENY` header in `next.config.mjs`.
  - `frame-ancestors 'none'` directive in `Content-Security-Policy`.

### TM-07: Inter-Tab Eavesdropping & BroadcastChannel Spoofing
- **Description:** A malicious script or rogue tab broadcasts malformed or spoofed `signed-in` / `refreshed` events over `BroadcastChannel('guildpass:auth')` to hijack session state in other tabs.
- **Risk Severity:** **Medium**
- **Mitigation Controls Implemented:**
  - Incoming BroadcastChannel messages in `SiweAuthProvider` (`lib/wallet/providers.tsx`) undergo strict structural validation:
    - Verifies presence and string types of `token`, `address`, and `expiresAt`.
    - Verifies that `msg.session.address` matches the currently connected wallet address (`account.address`). Mismatched or malformed session messages are discarded.

### TM-08: SIWE Domain Binding & Signature Replay
- **Description:** Attacker presents a SIWE signing request on a phishing domain and replays the signed EIP-4361 message to `guildpass-integrations`.
- **Risk Severity:** **Medium**
- **Mitigation Controls Implemented:**
  - `buildSiweMessage()` embeds `domain` (`config.siwe.domain`) and `uri` (`window.location.origin`) into the EIP-4361 payload.
  - The backend (`guildpass-core`) verifies that the signed domain matches the server's expected domain, preventing cross-domain signature replay.
  - Nonces have a 5-minute TTL and single-use invalidation.

---

## 6. Security Header Configuration (`next.config.mjs`)

The application enforces the following security headers across all routes:

```javascript
{
  key: 'Content-Security-Policy',
  value: [
    "default-src 'self'",
    "connect-src 'self' <NEXT_PUBLIC_CORE_API_URL> <NEXT_PUBLIC_WALLET_RPC_*>",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
},
{ key: 'X-Frame-Options', value: 'DENY' },
{ key: 'X-Content-Type-Options', value: 'nosniff' },
{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
{ key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
{ key: 'X-XSS-Protection', value: '0' }
```

---

## 7. Cross-References & History

- **Issue #25 (Frontend Hardening):** Implemented initial CSP and `sessionStorage` encapsulation.
- **Issues #36 / #44 (Integration Gateway CSRF & Admin Session Contract):** Added `validateIntegrationGatewayCsrf()` and established non-cookie Bearer token mutation invariants.
- **Issue #166 & `docs/http-only-cookie-migration.md`:** Target architecture replacing `sessionStorage` bearer tokens with httpOnly, Secure, SameSite=Strict session cookies once backend support is deployed.
- **`SECURITY.md`:** Repository security policy and vulnerability disclosure process.
