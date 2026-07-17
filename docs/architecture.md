# Architecture

This document describes the high-level architecture of the GuildPass frontend
(`guildpass-integrations`), with a focus on the data-flow paths that are hardest
to reconstruct from the source alone: the mock/live API switch, the SIWE
authentication context, the gated-content decision chain, and the optional
server-side integration gateway.

---

## Request-flow diagram

```mermaid
flowchart TD
    Browser["Browser / Next.js page"]

    subgraph Providers["RootProviders  (lib/wallet/providers.tsx)"]
        WagmiProvider["WagmiProvider\n(wagmi + viem)"]
        QCP["QueryClientProvider\n(React Query)"]
        SIWEP["SiweAuthProvider\nuseSiweAuth()"]
    end

    Browser --> Providers

    subgraph APILayer["API layer  (lib/api/)"]
        getApi["getApi(address?, token?)\nlib/api/index.ts"]
        MockApi["MockAccessApi\nlib/api/mock.ts\n(in-memory, no network)"]
        LiveApi["LiveAccessApi\nlib/api/live.ts\nfetch → NEXT_PUBLIC_CORE_API_URL"]
    end

    Providers --> getApi
    getApi -- "NEXT_PUBLIC_MOCK_MODE=true" --> MockApi
    getApi -- "NEXT_PUBLIC_MOCK_MODE=false" --> LiveApi

    subgraph SIWEFlow["SIWE sign-in flow"]
        Nonce["POST /v1/auth/siwe/nonce"]
        Sign["wagmi signMessage\n(EIP-4361, gasless)"]
        Verify["POST /v1/auth/siwe/verify\n→ { token, expiresAt }"]
        Session["sessionStorage\nlib/session.ts\nguildpass:siwe-session"]
    end

    SIWEP -- "signIn()" --> Nonce
    Nonce --> Sign
    Sign --> Verify
    Verify --> Session
    Session -- "loadAuthSession()" --> SIWEP

    subgraph CoreBackend["guildpass-core  (external)"]
        CoreAPI["guildpass-core\n/v1/* endpoints"]
    end

    LiveApi -- "reads / writes" --> CoreAPI
    MockApi -- "simulates nonce + verify\nin-memory" --> Session

    subgraph AdminGuard["AdminGuard  (components/admin-guard.tsx)"]
        Disconnected["State: disconnected\n→ 'Connect wallet'"]
        Unauth["State: unauthenticated\n→ 'Sign In With Ethereum'"]
        Auth["State: authenticated\n→ render children"]
    end

    SIWEP -- "status" --> AdminGuard
    AdminGuard --> Disconnected
    AdminGuard --> Unauth
    AdminGuard --> Auth

    subgraph GatedContent["Gated component  (components/gated.tsx)"]
        FetchSession["useQuery: getSession()"]
        FetchPolicies["useQuery: listPolicies()"]
        AccessDecision["computeAccessDecision()\n(tier / role check)"]
        GatedAllow["Render children"]
        GatedDeny["AccessDenied state"]
    end

    Auth --> GatedContent
    FetchSession --> AccessDecision
    FetchPolicies --> AccessDecision
    AccessDecision -- "allowed" --> GatedAllow
    AccessDecision -- "denied" --> GatedDeny

    subgraph IntegrationGateway["Integration gateway  (app/api/integration/*)  — server-side only"]
        GatewayRoutes["Next.js Route Handlers\nGET /api/integration/membership\nGET /api/integration/verify"]
        IntClient["@guildpass/integration-client\n(optional private package)\nINTEGRATION_API_KEY — never in browser"]
        GatewayFallback["503 safe error\nif package / key missing"]
    end

    LiveApi -- "optional — live mode only" --> GatewayRoutes
    GatewayRoutes --> IntClient
    IntClient -- "missing" --> GatewayFallback
    IntClient -- "present" --> CoreAPI
```

---

## Component / module reference

| Path | Role in the diagram |
|------|---------------------|
| `app/*` | Next.js App Router pages (`/dashboard`, `/admin`, `/resources/[resourceId]`, `/events/demo`, `/developer`) |
| `lib/wallet/providers.tsx` | `RootProviders`: composes `WagmiProvider`, `QueryClientProvider`, and `SiweAuthProvider`; exposes `useSiweAuth()` |
| `lib/api/index.ts` | `getApi(address?, token?)` — returns `MockAccessApi` or `LiveAccessApi` based on `NEXT_PUBLIC_MOCK_MODE` |
| `lib/api/live.ts` | Fetches real data from `guildpass-core`; raises `AuthError` on 401 |
| `lib/api/mock.ts` | In-memory mock; simulates SIWE nonce/verify without a real signature |
| `lib/api/types.ts` | Shared TypeScript types (auto-generated from `test/fixtures/openapi.json`) |
| `lib/api/access-decision.ts` | Pure function: computes allow/deny from a session + policy (tier + role check) |
| `lib/session.ts` | `sessionStorage` helpers — persists and loads the SIWE token under `guildpass:siwe-session` |
| `lib/wallet/config.ts` | Builds the wagmi config from `NEXT_PUBLIC_WALLET_*` env vars |
| `lib/config.ts` | Validates all `NEXT_PUBLIC_*` env vars at startup; throws `ConfigError` on bad values |
| `lib/features.ts` | Feature-flag helpers; reads `NEXT_PUBLIC_FEATURE_*` env vars |
| `components/admin-guard.tsx` | Three-state gate: `disconnected` → `unauthenticated` → `authenticated`; shows inline SIWE prompt |
| `components/gated.tsx` | Fetches session + policies, computes access decision, renders children or `AccessDenied` |
| `components/wallet/connect-button.tsx` | Three-state wallet button (disconnected / connected / authenticated) |
| `components/nav.tsx` | Navigation bar; hides feature-flagged links automatically |
| `app/api/integration/*` | Server-side Next.js route handlers; wraps `@guildpass/integration-client` |
| `lib/integration-client.ts` | Loads the optional private package at runtime; normalises its responses; never runs in the browser |
| `test/fixtures/openapi.json` | OpenAPI schema that defines the canonical contract for `lib/api/types.ts` |
| `scripts/sync-api-types.js` | Zero-dependency compiler: converts `openapi.json` → `lib/api/types.ts` |

---

## SIWE authentication flow (sequence)

```mermaid
sequenceDiagram
    actor User
    participant UI as Browser UI
    participant SIWEP as SiweAuthProvider
    participant Backend as guildpass-core

    User->>UI: Connect wallet
    UI->>SIWEP: address available
    User->>UI: Click "Sign In"
    SIWEP->>Backend: POST /v1/auth/siwe/nonce { address }
    Backend-->>SIWEP: { nonce }
    SIWEP->>User: wagmi signMessage (EIP-4361, gasless)
    User-->>SIWEP: signature
    SIWEP->>Backend: POST /v1/auth/siwe/verify { message, signature }
    Backend-->>SIWEP: { token, address, expiresAt }
    SIWEP->>SIWEP: storeAuthSession() → sessionStorage
    Note over SIWEP: Token auto-attached as Bearer<br/>on all admin mutations
    User->>UI: Logout
    SIWEP->>Backend: POST /v1/auth/siwe/logout (Bearer)
    SIWEP->>SIWEP: clearAuthSession()
```

> In **mock mode** all three SIWE endpoints are simulated in `lib/api/mock.ts`
> — no backend or MetaMask signature required.

---

## Integration gateway flow

```mermaid
flowchart LR
    Browser["Browser\n(client component)"]
    Route["Next.js Route Handler\napp/api/integration/*\n(server-side)"]
    Lib["lib/integration-client.ts"]
    Pkg["@guildpass/integration-client\n(optional private package)"]
    Core["guildpass-core"]

    Browser -- "GET /api/integration/membership?address=…" --> Route
    Route --> Lib
    Lib -- "INTEGRATION_API_KEY present\npackage installed" --> Pkg
    Pkg --> Core
    Lib -- "key or package missing" --> Route
    Route -- "503 safe error" --> Browser
```

`INTEGRATION_API_KEY` is a **server-only** environment variable and is never
bundled into browser JavaScript.
