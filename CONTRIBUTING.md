# Contributing to GuildPass Frontend

Thank you for your interest in contributing to the GuildPass Frontend!

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Finding Issues](#finding-issues)
- [Development Setup](#development-setup)
- [Branching & Commits](#branching--commits)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Review Process](#review-process)
- [Communication](#communication)

---

## Code of Conduct

By participating you agree to our [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## Ways to Contribute

- Fix UI bugs or visual regressions
- Add or improve member/admin dashboard components
- Improve wallet connect or role-aware UX
- Add tests or improve existing test coverage
- Improve accessibility (a11y) across pages
- Improve TypeScript types in `lib/api/types.ts`
- Improve mock data in the demo/mock API layer
- Fix linting or TypeScript errors

---

## Finding Issues

1. Browse issues directly on GitHub:
   - [`good first issue`](https://github.com/Adamantine-Guild/guildpass-integrations/issues?q=label%3A%22good+first+issue%22)
   - [`help wanted`](https://github.com/Adamantine-Guild/guildpass-integrations/issues?q=label%3A%22help+wanted%22)
2. Comment `I'd like to work on this` on the GitHub issue you'd like to work on.
3. Wait for a maintainer to assign it before starting.

---

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+

### Steps

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/guildpass-integrations.git
cd guildpass-integrations

# 2. Install dependencies
npm install

# 3. Copy and configure environment
cp .env.example .env.local
# For mock mode, no changes needed

# 4. Start the dev server in mock mode
NEXT_PUBLIC_MOCK_MODE=true npm run dev

# Open http://localhost:3000
```

### Architecture overview

| Path                   | Purpose                        |
| ---------------------- | ------------------------------ |
| `app/*`                | Next.js App Router pages       |
| `lib/api/*`            | API layer (mock ↔ live switch) |
| `components/ui/*`      | Shadcn-style UI primitives     |
| `components/gated.tsx` | Access-gate component          |
| `components/nav.tsx`   | Navigation bar                 |

---

## Branching & Commits

- Branch off `main`: `git checkout -b feat/short-description` or `fix/short-description`
- Conventional commits:
  - `feat: add contribution history section to member dashboard`
  - `fix: correct role badge colour for contributor`
  - `style: align spacing on admin member list`
  - `test: add mock API test for membership status`
  - `chore: upgrade wagmi to v2.13`

---

## Submitting a Pull Request

1. Push your branch to your fork.
2. Open a PR against `Adamantine-Guild/guildpass-integrations` on `main`.
3. Fill in the [PR template](.github/PULL_REQUEST_TEMPLATE.md) completely.
4. Ensure these pass:

```bash
npm run typecheck   # Must pass
npm run lint        # Fix all reported issues
```

### PR Quality Expectations

- UI changes must include a screenshot in the PR description.
- New components must work in mock mode (`NEXT_PUBLIC_MOCK_MODE=true`).
- Keep feature logic separate from presentational components.
- Add loading, empty, and error states in new feature modules.
- Prefer typed APIs and React Query for data fetching.
- No inline styles — use Tailwind classes.

---

## Review Process

- A maintainer will review your PR within **5 business days**.
- UI-heavy PRs may require a recording or live demo.
- Address all requested changes promptly.

---

## Communication

- GitHub Issues: preferred for task discussion and bug reports
- Contact: cerealboxx123@gmail.com

## Accessibility expectations

- Every interactive control must have a visible text label or an `aria-label`/`aria-labelledby` that describes the action clearly.
- Form inputs and selects must be associated with labels using `htmlFor`/`id`, and validation messages should be connected with `aria-describedby` where useful.
- Preserve visible keyboard focus. Do not remove outlines unless replacing them with a high-contrast `focus-visible` ring.
- Wallet addresses and other long identifiers should be visually truncated with reusable helpers such as `AddressText`, while keeping the full value available through accessible text or a title.
- Responsive layouts should remain usable at narrow viewport widths: wrap navigation/actions, avoid fixed-width content that overflows, and keep data tables horizontally scrollable when necessary.
- Loading, error, denied, and success messages should use semantic status roles (`status`, `alert`, or equivalent) so screen readers receive important updates.
