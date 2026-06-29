# GuildPass Frontend (guildpass-integrations)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green?style=flat-square)](https://nodejs.org)

The main frontend MVP for the GuildPass ecosystem. Built with **Next.js 14 App Router**, TypeScript, Tailwind CSS, wagmi/viem, and React Query, this app provides the member and admin dashboards for the GuildPass token-gated community platform.

> **Part of the [Adamantine-Guild](https://github.com/Adamantine-Guild) project** — a Web3 membership and token-gated community platform built for the open-source ecosystem.

---

## Features (MVP)

- **Member dashboard** — wallet connect, membership state, community & tier, expiration, badges placeholder, gated resources, profile summary
- **Admin dashboard** — overview, member list, role assignment, resource access policies, community settings
- **Access-gated experiences** — gated pages, gated content sections, event access, denied states, upgrade/renew placeholders
- **Wallet-aware UX** — connect flow, SIWE-authenticated admin experience, role-aware UI states, admin-only sections
- **SIWE authentication** — Sign-In with Ethereum (EIP-4361) for admin sessions; gasless off-chain signature; short-lived token attached to all mutations
- **Local development** — mock/demo mode with seeded fake data; typed API layer switches between mock and live; SIWE fully simulated in mock mode

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
# Clone and enter
git clone https://github.com/Adamantine-Guild/guildpass-integrations.git
cd guildpass-integrations

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local as needed (mock mode requires no changes)
```

### Run in mock / demo mode

```bash
NEXT_PUBLIC_MOCK_MODE=true npm run dev
```

Open http://localhost:3000. In mock mode, a "Dev" link appears in the navigation, taking you to the developer controls page with tools for resetting mock data and applying scenario presets.

#### Mock Developer Controls
In mock mode, visit `/developer` (or click "Dev" in the nav) to access:
- **Reset Mock Data**: Reset all mock data (members, resources, policies, webhook events) to initial state
- **Scenario Presets**: Apply predefined testing scenarios:
  - Active Member: Active standard tier user
  - Expired Member: Inactive user with expired membership
  - Denied Resource: Free tier user denied access to Alpha Docs
  - Admin Session Expired: Admin user to test expired SIWE sessions
  - No Roles: Member with no roles assigned

### Run against live guildpass-core

By default, live mode assumes the backend is running at `http://localhost:4000`.

```bash
# Set NEXT_PUBLIC_CORE_API_URL in .env.local if your backend runs on a different port
# Also provide INTEGRATION_API_KEY for the server-side integration gateway
npm run dev
```

---

## Authentication (SIWE)

Admin actions are protected by [Sign-In with Ethereum (EIP-4361)](https://eips.ethereum.org/EIPS/eip-4361). After connecting a wallet, admins must sign a one-time, gasless message. The backend verifies the signature and returns a short-lived session token attached as `Authorization: Bearer` on all privileged mutations.

### Sign-in flow

```
1. User connects wallet
2. UI shows "Sign In" with explanation — no gas required
3. Frontend requests a nonce: POST /v1/auth/siwe/nonce
4. EIP-4361 message built client-side (domain, statement, nonce, chainId, issuedAt)
5. wagmi signMessage → user approves in wallet
6. POST /v1/auth/siwe/verify → { token, expiresAt }
7. Token stored in sessionStorage; auto-attached to admin mutations
8. 401 from backend shows inline re-auth banner without page redirect
```

### Required backend endpoints (live mode only)

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/v1/auth/siwe/nonce` | `{ address }` | `{ nonce: string }` |
| `POST` | `/v1/auth/siwe/verify` | `{ message, signature }` | `{ token, address, expiresAt }` |
| `POST` | `/v1/auth/siwe/logout` | — (Bearer token in header) | `204 No Content` |

> In **mock mode** all three endpoints are simulated in-memory — no backend required.

---

## Environment Variables

All configuration is read and validated at startup by [`lib/config.ts`](./lib/config.ts).  
Invalid values produce a clear `ConfigError` in development so broken configuration is caught
immediately rather than at runtime.

| Variable | Required | Description |
| ---- | ------- | ----------- |
| `NEXT_PUBLIC_MOCK_MODE` | No | Set `true` for in-memory mock API; SIWE fully simulated |
| `NEXT_PUBLIC_DEMO_MODE` | No | Alias for `NEXT_PUBLIC_MOCK_MODE` |
| `NEXT_PUBLIC_CORE_API_URL` | Live mode only (validated) | Base URL of the `guildpass-core` access-api — must be a valid absolute URL in live mode |
| `NEXT_PUBLIC_SIWE_DOMAIN` | No | Domain field in the EIP-4361 message (defaults to `localhost:3000`) |
| `NEXT_PUBLIC_SIWE_STATEMENT` | No | Human-readable statement shown in the signed message |

See [`.env.example`](./.env.example) for a ready-to-copy template.

---

## Feature Flags

Modules that are experimental or not yet production-ready are controlled by environment variables. Setting a flag to `"false"` hides the corresponding navigation item and shows a clear "unavailable" state when the route is visited directly.

| Variable | Default (mock mode) | Default (prod) | Module |
| -------- | ------------------- | -------------- | ------ |
| `NEXT_PUBLIC_FEATURE_ADMIN_POLICIES` | `true` | `true` | Access policy editor in `/admin/policies` |
| `NEXT_PUBLIC_FEATURE_EVENTS` | `true` | `false` | Event access page at `/events/*` |
| `NEXT_PUBLIC_FEATURE_RESOURCES` | `true` | `true` | Gated resources at `/resources/*` |
| `NEXT_PUBLIC_FEATURE_ANALYTICS` | `false` | `false` | Analytics module (not yet built) |
| `NEXT_PUBLIC_FEATURE_GOVERNANCE` | `false` | `false` | Governance module (not yet built) |

**How flags work:**

- All flags are read at build time from `NEXT_PUBLIC_*` environment variables. No remote flag service is involved.
- An omitted variable falls back to the default shown above.
- In **mock/demo mode** (`NEXT_PUBLIC_MOCK_MODE=true`), flags for `adminPolicies`, `events`, and `resources` default to `true` so the full demo works locally without any extra configuration.
- Flags for deferred modules (`analytics`, `governance`) default to `false` in every environment and must be explicitly set to `"true"` to enable them.
- Navigation links for disabled modules are automatically hidden.
- Visiting a disabled route directly renders a clear "Feature unavailable" message instead of broken content.

**Adding a new flag:**

1. Add the typed field to `FeatureFlags` in `lib/features.ts` and wire up the `flag()` call.
2. Document the variable in `.env.example` with its recommended production default.
3. Wrap the relevant page with `<FeatureGate enabled={features.yourFlag} name="Module Name">`.
4. Filter the corresponding nav item using `features.yourFlag`.

---

## Scripts

```bash
npm run dev        # Start Next.js dev server (http://localhost:3000)
npm run build      # Production build
npm run start      # Start production server (after build)
npm run lint       # Lint via Next.js ESLint config
npm run typecheck  # TypeScript type checking
npm run sync-types # Compile test/fixtures/openapi.json into lib/api/types.ts
npm run check-types # Validate that types in lib/api/types.ts match the schema
```

---

## Architecture

| Path | Purpose |
| ---- | ------- |
| `app/*` | Next.js App Router pages |
| `lib/wallet/providers.tsx` | wagmi, React Query, and `SiweAuthContext` providers; `useSiweAuth()` hook |
| `lib/api/*` | API layer (`getApi(address?, token?)` switches mock ↔ live) |
| `lib/api/live.ts` | Live integration with `guildpass-core`; `AuthError` for 401 handling |
| `lib/api/mock.ts` | In-memory mock; simulates SIWE endpoints without real signatures |
| `lib/api/types.ts` | Shared TypeScript types (auto-generated from `openapi.json`) |
| `lib/session.ts` | `sessionStorage` helpers for SIWE token persistence |
| `components/ui/*` | Minimal shadcn-style UI primitives |
| `components/gated.tsx` | Access-gate component |
| `components/admin-guard.tsx` | 3-layer admin guard (wallet → SIWE → role) with `SiwePrompt` |
| `components/wallet/connect-button.tsx` | 3-state button (disconnected / connected / authenticated) |
| `components/nav.tsx` | Navigation bar |
| `test/fixtures/openapi.json` | OpenAPI schema contract fixture representing core API models |
| `scripts/sync-api-types.js` | Zero-dependency compiler converting openapi.json to typescript types |

---

## Integration Points

- **Access API**: `lib/api/live.ts` integrates with `guildpass-core` `/v1/*` endpoints
- **Contract clients/ABIs**: Add viem/wagmi hooks in feature modules as needed
- **Shared types**: `lib/api/types.ts` — align with `guildpass-core` shared types package

### Live API endpoints

All live requests are sent to `NEXT_PUBLIC_CORE_API_URL` (default `http://localhost:4000`).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/session?address=<addr>` | — | Current session for address |
| `GET` | `/v1/community` | — | Community info |
| `GET` | `/v1/members` | — | All member rows |
| `GET` | `/v1/members/:address/membership` | — | Membership for address |
| `GET` | `/v1/members/:address/profile` | — | Profile for address |
| `GET` | `/v1/resources` | — | Available gated resources |
| `GET` | `/v1/policies` | — | Access policies |
| `GET` | `/v1/admin/events` | Bearer | Admin webhook event feed |
| `POST` | `/v1/members/:address/roles` | Bearer | Assign role to member |
| `PUT` | `/v1/policies/:resourceId` | Bearer | Update access policy |
| `POST` | `/v1/auth/siwe/nonce` | — | Request SIWE nonce |
| `POST` | `/v1/auth/siwe/verify` | — | Verify SIWE signature → token |
| `POST` | `/v1/auth/siwe/logout` | Bearer | Invalidate session |

### Local dashboard integration gateway

When live mode is enabled, the dashboard uses server-side route handlers to access `@guildpass/integration-client` without exposing private credentials. This is an **optional** integration. To enable it, you must install the private `@guildpass/integration-client` package and set `INTEGRATION_API_KEY` in your `.env.local`. If the package or key is missing, the gateway will return safe 503 errors.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/integration/membership?address=<wallet>` | Lookup membership by wallet address |
| `GET` | `/api/integration/verify?address=<wallet>` | Verify wallet status |

> Path and query parameters are URL-encoded. The integration gateway uses `INTEGRATION_API_KEY` from server environment variables and never exposes it to the browser.

---

## Deployment

See [docs/deployment.md](./docs/deployment.md)
for production deployment instructions,
environment variables,
smoke checks,
and troubleshooting.

## What's Implemented vs Deferred

**Implemented**:
- Core member and admin surfaces listed above
- Basic role assignment and policy editing
- Gated pages and states

**Deferred (intentionally)**:
- Advanced analytics and governance
- Rich profile customization and contribution history
- Social graph and advanced moderation
- Complex admin workflows, rewards visualization, full event management
- Complete billing/subscription management UX

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

### How to contribute

1. Browse open issues tagged [`good first issue`](https://github.com/Adamantine-Guild/guildpass-integrations/issues?q=label%3A%22good+first+issue%22) or [`help wanted`](https://github.com/Adamantine-Guild/guildpass-integrations/issues?q=label%3A%22help+wanted%22).
2. Comment directly on the GitHub issue you'd like to work on.
3. Fork the repo, create a feature branch, implement your change, open a PR.

### Maintainer contact

- Contact: cerealboxx123@gmail.com

## License

MIT — see [LICENSE](./LICENSE).
