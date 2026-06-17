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

Open http://localhost:3000.

### Run against live guildpass-core

```bash
# Set NEXT_PUBLIC_CORE_API_URL in .env.local first
npm run dev
```

---

## Authentication (SIWE)

Admin actions are protected by [Sign-In with Ethereum (EIP-4361)](https://eips.ethereum.org/EIPS/eip-4361). After connecting a wallet, admins must sign a one-time, gasless message. The backend verifies the signature and returns a short-lived session token attached as `Authorization: Bearer` on all privileged mutations.

### Sign-in flow

```
1. User connects wallet
2. UI shows "Sign In" with explanation — no gas required
3. Frontend requests a nonce: POST /access-api/siwe/nonce
4. EIP-4361 message built client-side (domain, statement, nonce, chainId, issuedAt)
5. wagmi signMessage → user approves in wallet
6. POST /access-api/siwe/verify → { token, expiresAt }
7. Token stored in sessionStorage; auto-attached to admin mutations
8. 401 from backend shows inline re-auth banner without page redirect
```

### Required backend endpoints (live mode only)

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/access-api/siwe/nonce` | `{ address }` | `{ nonce: string }` |
| `POST` | `/access-api/siwe/verify` | `{ message, signature }` | `{ token, address, expiresAt }` |
| `POST` | `/access-api/siwe/logout` | — (Bearer token in header) | `204 No Content` |

> In **mock mode** all three endpoints are simulated in-memory — no backend required.

---

## Environment Variables

| Variable | Required | Description |
| ---- | ------- | ----------- |
| `NEXT_PUBLIC_MOCK_MODE` | No | Set `true` for in-memory mock API; SIWE fully simulated |
| `NEXT_PUBLIC_DEMO_MODE` | No | Alias for `NEXT_PUBLIC_MOCK_MODE` |
| `NEXT_PUBLIC_CORE_API_URL` | Live mode only | Base URL of the `guildpass-core` access-api |
| `NEXT_PUBLIC_SIWE_DOMAIN` | No | Domain field in the EIP-4361 message (defaults to `window.location.host`) |
| `NEXT_PUBLIC_SIWE_STATEMENT` | No | Human-readable statement shown in the signed message |

See [`.env.example`](./.env.example) for a ready-to-copy template.

---

## Scripts

```bash
npm run dev        # Start Next.js dev server (http://localhost:3000)
npm run build      # Production build
npm run start      # Start production server (after build)
npm run lint       # Lint via Next.js ESLint config
npm run typecheck  # TypeScript type checking
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
| `lib/api/types.ts` | Shared TypeScript types incl. `SiweAuthSession`, `SiweAuthState` |
| `lib/session.ts` | `sessionStorage` helpers for SIWE token persistence |
| `components/ui/*` | Minimal shadcn-style UI primitives |
| `components/gated.tsx` | Access-gate component |
| `components/admin-guard.tsx` | 3-layer admin guard (wallet → SIWE → role) with `SiwePrompt` |
| `components/wallet/connect-button.tsx` | 3-state button (disconnected / connected / authenticated) |
| `components/nav.tsx` | Navigation bar |

---

## Integration Points

- **Access API**: `lib/api/live.ts` integrates with `guildpass-core` `/v1/*` endpoints
- **Contract clients/ABIs**: Add viem/wagmi hooks in feature modules as needed
- **Shared types**: `lib/api/types.ts` — align with `guildpass-core` shared types package

---

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
