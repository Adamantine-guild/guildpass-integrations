# Contributing to GuildPass Frontend

Thank you for your interest in contributing to the GuildPass Frontend!

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Finding Issues](#finding-issues)
- [Development Setup](#development-setup)
- [Branching & Commits](#branching--commits)
- [Working with API Types](#working-with-api-types)
- [Before Opening a Pull Request](#before-opening-a-pull-request)
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

## Working with API Types

The frontend's shared API types in [`lib/api/types.ts`](./lib/api/types.ts) are
**not hand-written**. They are auto-generated from an OpenAPI contract fixture,
[`test/fixtures/openapi.json`](./test/fixtures/openapi.json), which mirrors the
models exposed by **guildpass-core** (the backend). A zero-dependency compiler,
[`scripts/sync-api-types.js`](./scripts/sync-api-types.js), converts the fixture
into TypeScript.

This split exists so the frontend types and the backend contract can't silently
drift. If you edit `lib/api/types.ts` by hand, `npm run check-types` will fail,
and the next `npm run sync-types` will overwrite your changes — **always
edit the fixture instead.**

### When to touch the fixture

Update `test/fixtures/openapi.json` whenever a change you are making depends on
(or alters) the shape of an API model — for example adding a field to a
`Membership`, renaming a property, or adding an enum value. If your change only
touches UI or component logic and reuses existing types, you do **not** need to
touch the fixture.

### How to regenerate the types

Two npm scripts drive the workflow (see the [Scripts section of the README](../README.md#scripts)):

| Script | What it does |
| ------ | ------------ |
| `npm run sync-types` | Compiles `test/fixtures/openapi.json` and **writes** the result into `lib/api/types.ts`. |
| `npm run check-types` | Validates that `lib/api/types.ts` matches the fixture. Exits non-zero on drift — used by CI and local checks. |

### Worked example

Say you want to add a `joinedAt` timestamp to the `Membership` model:

1. **Edit the fixture** — add the new property to
   `test/fixtures/openapi.json` under the `Membership` schema's `properties`,
   and include it in `required` if it should be non-optional:

   ```json
   "Membership": {
     "type": "object",
     "required": ["address", "role", "joinedAt"],
     "properties": {
       "address": { "type": "string" },
       "role": { "type": "string" },
       "joinedAt": { "type": "string", "format": "date-time" }
     }
   }
   ```

2. **Regenerate the types**:

   ```bash
   npm run sync-types
   ```

   This rewrites `lib/api/types.ts`. Inspect the diff — you should see the new
   `joinedAt: string` field appear on the `Membership` interface.

3. **Confirm there is no drift**:

   ```bash
   npm run check-types
   # → SUCCESS: Frontend API types are in sync with openapi.json.
   ```

4. **Commit both** the fixture change and the regenerated `lib/api/types.ts`
   together, so they stay in lockstep.

### How drift is caught

`npm run check-types` is the guard rail. Locally you can run it before pushing,
and CI runs it as part of the checks. If the fixture and `lib/api/types.ts`
disagree, the script prints `FAIL: Type drift detected!` and exits `1`, blocking
the build until you re-run `npm run sync-types`. Treat a red `check-types` as a
signal to re-sync, not to hand-edit the generated file.

---

## Before Opening a Pull Request

Use this checklist in order from the repository root before opening or
updating any pull request:

- [ ] If `test/fixtures/openapi.json` changed, run `npm run sync-types` first.
- [ ] When types were regenerated, review the generated changes and commit
      `test/fixtures/openapi.json` and `lib/api/types.ts` together.
- [ ] Run `npm run lint` and fix all reported issues.
- [ ] Run `npm run typecheck` and resolve all TypeScript errors.
- [ ] Run `npm run check-types` to confirm that the generated API types match
      the OpenAPI fixture.

```bash
# Only when test/fixtures/openapi.json changed:
npm run sync-types

# Required before every pull request:
npm run lint
npm run typecheck
npm run check-types
```

`npm run sync-types` writes generated output to `lib/api/types.ts`, so it is
only required when the source contract in `test/fixtures/openapi.json`
changes. UI and component changes that reuse existing API models do not
require regeneration.

`npm run check-types` never writes files. It compares the output that
`scripts/sync-api-types.js` would generate with the committed
`lib/api/types.ts` file and exits non-zero if they differ. Run this check
before every pull request, whether or not the fixture was changed.

If `check-types` reports drift after an intentional fixture change, run
`npm run sync-types` and review the generated diff. Do not fix drift by
editing `lib/api/types.ts` manually.

---
## Submitting a Pull Request

1. Push your branch to your fork.
2. Open a PR against `Adamantine-Guild/guildpass-integrations` on `main`.
3. Fill in the [PR template](.github/PULL_REQUEST_TEMPLATE.md) completely.
4. Complete the [pre-PR checklist](#before-opening-a-pull-request) and ensure
   every required command passes.

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
