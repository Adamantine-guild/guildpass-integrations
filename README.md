# GuildPass Frontend (guildpass-integrations)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green?style=flat-square)](https://nodejs.org)

The main frontend MVP for the GuildPass ecosystem. Built with **Next.js 14 App Router**, TypeScript, Tailwind CSS, wagmi/viem, and React Query, this app provides the member and admin dashboards for the GuildPass token-gated community platform.

> **Part of the [Adamantine-Guild](https://github.com/Adamantine-Guild) project** — a Web3 membership and token-gated community platform built for the open-source ecosystem.

---

## Features (MVP)

- **Member dashboard** — wallet connect, membership state, community & tier, expiration, badges, gated resources, wallet verification status, and a self-service profile editor (`NEXT_PUBLIC_FEATURE_PROFILES`)
- **Admin dashboard** — overview, member list, role assignment, resource access policies, community settings, analytics (`NEXT_PUBLIC_FEATURE_ANALYTICS`)
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

See [Mock scenario presets](./docs/mock-scenarios.md) for the exact seeded membership, role, badge, resource, and policy state behind each preset.
  - Multiple Communities: Member active across several communities

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
| `NEXT_PUBLIC_WALLET_CHAINS` | No | Comma-separated supported chains for wagmi; supported values: `mainnet`, `base`, `sepolia`; defaults to all three |
| `NEXT_PUBLIC_WALLET_RPC_MAINNET` | No | Optional browser-safe RPC URL for Ethereum mainnet when enabled |
| `NEXT_PUBLIC_WALLET_RPC_BASE` | No | Optional browser-safe RPC URL for Base when enabled |
| `NEXT_PUBLIC_WALLET_RPC_SEPOLIA` | No | Optional browser-safe RPC URL for Sepolia when enabled |
| `NEXT_PUBLIC_WALLET_CONNECTORS` | No | Comma-separated wallet connectors; see [Wallet connectors](#wallet-connectors) for supported values (defaults to `injected`) |

See [`.env.example`](./.env.example) for a ready-to-copy template.

Wallet chain settings are built by [`lib/wallet/config.ts`](./lib/wallet/config.ts). Invalid chain names, empty chain lists, unsupported connectors, or malformed RPC URLs throw a `ConfigError` during development so deployment mistakes are visible before users connect a wallet. In mock mode, leaving these variables unset preserves the local default of `mainnet`, `base`, and `sepolia` with default transports.

Only expose RPC URLs that are safe to bundle into browser JavaScript. Do not put private RPC credentials in `NEXT_PUBLIC_*` variables unless your provider explicitly documents that the key is public and browser-safe.

### Wallet connectors

`NEXT_PUBLIC_WALLET_CONNECTORS` selects which wagmi connectors are offered in the connect dialog.

Currently supported values:

| Value | Connector |
| ----- | --------- |
| `injected` | Browser-extension / injected wallets (MetaMask, Rabby, etc.) — the default |

Setting any other value (for example `walletconnect`) throws a `ConfigError` at startup that lists the supported values and links back to this section — connectors are compiled into the bundle, so an unrecognized name can never work at runtime and is better caught early.

To add support for a new connector:

1. Add its name to `SUPPORTED_CONNECTOR_NAMES` in [`lib/wallet/connectors.ts`](./lib/wallet/connectors.ts).
2. Map the name to a wagmi connector factory in `buildConnectors()` in [`lib/wallet/config.ts`](./lib/wallet/config.ts) (e.g. `walletConnect({ projectId })` from `@wagmi/connectors`, including any env variables it needs).
3. Document the new value in this table and in [`.env.example`](./.env.example).

---

## Feature Flags

Modules that are experimental or not yet production-ready are controlled by environment variables. Setting a flag to `"false"` hides the corresponding navigation item and shows a clear "unavailable" state when the route is visited directly.

| Variable | Default (mock mode) | Default (prod) | Module |
| -------- | ------------------- | -------------- | ------ |
| `NEXT_PUBLIC_FEATURE_ADMIN_POLICIES` | `true` | `true` | Access policy editor in `/admin/policies` |
| `NEXT_PUBLIC_FEATURE_ADMIN_SETTINGS` | `true` | `false` | Advanced admin community settings at `/admin/settings` (persistence deferred for MVP) |
| `NEXT_PUBLIC_FEATURE_EVENTS` | `true` | `false` | Event access page at `/events/*` |
| `NEXT_PUBLIC_FEATURE_RESOURCES` | `true` | `true` | Gated resources at `/resources/*` |
| `NEXT_PUBLIC_FEATURE_ANALYTICS` | `false` | `false` | Analytics at `/admin/analytics` — membership growth, role/tier distribution, computed client-side from `listMembers()`/`listWebhookEvents()`, no dedicated backend endpoint (#249) |
| `NEXT_PUBLIC_FEATURE_GOVERNANCE` | `false` | `false` | Governance module (not yet built) |
| `NEXT_PUBLIC_FEATURE_PROFILES` | `false` | `false` | Public member profile view at `/members/[address]` — rich profile customization (#254) |
| `NEXT_PUBLIC_FEATURE_<NAME>_ROLLOUT_PCT` | unset | unset | Optional 0–100 percentage rollout for the matching flag |

**How flags work:**

- All flags are read at build time from `NEXT_PUBLIC_*` environment variables. No remote flag service is involved.
- An omitted variable falls back to the default shown above.
- Add `NEXT_PUBLIC_FEATURE_<NAME>_ROLLOUT_PCT` to canary a module to a percentage of users or sessions. For example, `NEXT_PUBLIC_FEATURE_ANALYTICS_ROLLOUT_PCT=25` enables analytics for identifiers whose deterministic bucket is 0–24.
- Rollout checks hash the feature key plus a wallet address or persisted anonymous session ID into a stable 0–99 bucket, so the same identifier receives the same experience across visits. If no rollout percentage is set, the original boolean flag behavior is used exactly.
- In **mock/demo mode** (`NEXT_PUBLIC_MOCK_MODE=true`), flags for `adminPolicies`, `adminSettings`, `events`, and `resources` default to `true` so the full demo works locally without any extra configuration.
- Flags for deferred modules (`analytics`, `governance`) default to `false` in every environment and must be explicitly set to `"true"` for full access or given a rollout percentage for canary access.
- Navigation links for disabled modules are automatically hidden.
- Visiting a disabled route directly renders a clear "Feature unavailable" message instead of broken content.

**Adding a new flag:**

1. Add the typed field to `FeatureFlags` in `lib/features.ts` and wire up the `flag()` call.
2. Document the variable in `.env.example` with its recommended production default.
3. Wrap the relevant page with `<FeatureGate enabled={features.yourFlag} name="Module Name">` for a binary flag, or pass `featureRollouts.yourFlag` plus `rolloutIdentifier` when the page supports percentage rollout.
4. Filter the corresponding nav item using `features.yourFlag` for binary launches, or `isFeatureEnabledForIdentifier('yourFlag', identifier)` when the current wallet/session identifier is available.
5. Optionally document `NEXT_PUBLIC_FEATURE_YOUR_FLAG_ROLLOUT_PCT` when the module supports a canary rollout.

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
npm run test       # Run unit tests (Node.js test runner)
npm run test:e2e   # Run end-to-end tests (Playwright)
npm run test:e2e:ui # Run E2E tests in UI mode for debugging
```

---

## Testing

### Unit Tests

Unit tests use the Node.js built-in test runner and cover individual components, utilities, and business logic:

```bash
npm run test
```

Tests include:
- Session storage and expiry logic
- SIWE message construction and verification
- Feature flags and access control
- API mocking and contract validation
- Wallet address validation
- Mock data scenarios

### End-to-End Tests

E2E tests use Playwright to verify the full SIWE sign-in flow in a real browser environment. Tests simulate wallet connections, message signing, and session management without requiring a real wallet or backend:

```bash
npm run test:e2e              # Run all E2E tests headlessly
npm run test:e2e:ui          # Run with visual UI (recommended for debugging)
npx playwright test --debug  # Step through with debugger
```

**Features tested:**
- Happy path: connect wallet → sign-in → authenticated
- Session persistence across page navigations
- Token storage (sessionStorage with expiry)
- Refresh token renewal
- 401 error handling → re-auth banner
- Session expiry recovery flow
- Logout and session clearing
- Cross-tab session sync (BroadcastChannel)

**Requirements:**
- Dev server must be running: `npm run dev`
- Tests run against `http://localhost:3000` by default (configurable via `BASE_URL` env var)
- Mock mode enabled automatically in tests

See [test/e2e/README.md](./test/e2e/README.md) for detailed E2E test documentation including troubleshooting and advanced usage.

---

## Architecture

For a full visual overview of the request flow, SIWE authentication sequence, and integration gateway, see **[docs/architecture.md](./docs/architecture.md)**.

The diagram covers:

- The `getApi()` mock ↔ live switch and both data paths
- Where `SiweAuthProvider` and `sessionStorage` fit in the auth flow
- The three-state `AdminGuard` and the `Gated` access-decision chain
- The optional server-side integration gateway and when it returns a 503

### Module reference

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
| `app/members/[address]/page.tsx` | Public, read-only member profile view (`NEXT_PUBLIC_FEATURE_PROFILES`) |
| `components/dashboard/profile-editor.tsx` | Self-service profile editor on the dashboard |
| `lib/validation/profile.ts` | Profile field validation (`validateProfile`) |
| `lib/api/analytics.ts` | Client-side analytics aggregation (`computeAnalyticsSummary`, `fetchAllMembers`) — no dedicated backend endpoint |

### Composable access rules

Access policies support an optional composable rule tree in addition to the legacy single-condition `minTier`/`roles` fields:

```ts
// "standard tier AND moderator role"
{ type: 'and', rules: [{ type: 'tier', minTier: 'standard' }, { type: 'role', role: 'moderator' }] }

// "pro tier OR the Early Member badge"
{ type: 'or', rules: [{ type: 'tier', minTier: 'pro' }, { type: 'badge', badge: 'Early Member' }] }
```

Primitive conditions are `tier` (tier ≥ X), `role` (has role Y), and `badge` (has badge Z); `and`/`or` nodes nest arbitrarily. When a policy sets `rule`, it takes precedence over `minTier`/`roles`; legacy policies are evaluated by wrapping them into an equivalent one-node tree, so behavior is unchanged. The recursive evaluator lives in [`lib/api/access-decision.ts`](./lib/api/access-decision.ts) (`evaluateAccessRule`), and the mock data seeds two demo policies (`mod-lounge` — a genuine AND, `insider-hub` — a genuine OR).

### Member profiles

Members can customize a `displayName`, `bio`, `avatar` (URL — image upload is a disabled "coming soon" stub, not implemented), and a list of `socialLinks` (`{ platform, url }`), in addition to the existing system-assigned `badges`. The feature is gated behind `NEXT_PUBLIC_FEATURE_PROFILES` (off by default in every environment, including mock mode — see [Feature Flags](#feature-flags)).

- **Editing** — the dashboard's "Profile" card (`components/dashboard/profile-editor.tsx`). Editing requires SIWE sign-in (reusing the same session as admin actions — see [docs/architecture.md](./docs/architecture.md#member-profile-edits-reuse-the-siwe-session-no-separate-auth-mechanism)), but *viewing* your own profile does not.
- **Public view** — `/members/[address]` (`app/members/[address]/page.tsx`) renders any member's customized fields read-only, with no wallet connection required and no `<Gated>` check (profile reads are public, matching `getProfile()`'s existing unauthenticated contract). Linked from the dashboard's Profile card and from each row in `/admin/members`.
- **Validation** — [`lib/validation/profile.ts`](./lib/validation/profile.ts) (`validateProfile()`), mirroring `validatePolicy()`'s `{valid, errors}` shape: length limits on `displayName`/`bio`, `http(s)`-only URL checks on `avatar` and each social link, and case-insensitive de-duplication of social link platforms.
- **`badges` is read-only** — it's system-assigned (community milestones), and `updateProfile()` never accepts client-submitted badges; both the mock and live clients always carry the existing value forward regardless of what's submitted.

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
| `GET` | `/v1/resources/:id` | — | Single resource lookup (with list fallback) |
| `GET` | `/v1/policies` | — | All access policies |
| `GET` | `/v1/policies/:resourceId` | — | Single policy lookup (with list fallback) |
| `GET` | `/v1/admin/events` | Bearer | Admin webhook event feed fallback snapshot |
| `GET` | `/v1/admin/events/stream` | Bearer | **Provisional proposal for guildpass-core**: SSE stream of admin webhook events (`text/event-stream`, one `WebhookEventLog` JSON object per `data:` frame). The frontend attempts this push transport first and silently falls back to `/v1/admin/events` polling if unavailable. |
| `POST` | `/v1/members/:address/roles` | Bearer | Assign role to member |
| `PUT` | `/v1/policies/:resourceId` | Bearer | Update access policy |
| `POST` | `/v1/auth/siwe/nonce` | — | Request SIWE nonce |
| `POST` | `/v1/auth/siwe/verify` | — | Verify SIWE signature → token |
| `POST` | `/v1/auth/siwe/logout` | Bearer | Invalidate session |

### Safe Fallback Mechanism

For compatibility with older backend versions that do not yet expose direct lookup endpoints (e.g., `GET /v1/resources/:id`), the API client implements a safe fallback. If a direct lookup returns a `404 Not Found`, the client automatically falls back to fetching the full list (e.g., `GET /v1/resources`) and filtering for the requested identifier client-side.

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
- Rich profile customization (#254)
- Basic analytics — membership growth, role/tier distribution, computed client-side (#249)

**Deferred (intentionally)**:
- Governance
- Richer analytics (e.g. per-resource access/denial tracking — the admin event log does not capture resource-access attempts today, only membership-lifecycle and policy-update events, so this isn't derivable from existing data; see [Feature Flags](#feature-flags))
- Contribution history
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
