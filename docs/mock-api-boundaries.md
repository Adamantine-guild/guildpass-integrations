# Mock API Module Boundaries and Consumer Contract

This document describes the architectural boundaries of the in-memory mock API, distinguishing between fixture data, behavior (simulation logic), and the application-facing API contract.

---

## Module Structure

### `lib/api/index.ts` — Public Application Entry Point

**Responsibility:** Sole import path for all API consumers.

**Exports:**
- `getApi(address?, token?, communityId?)` — Factory function returning `AccessApi` (mock or live based on `NEXT_PUBLIC_MOCK_MODE`)
- Types from `types.ts` (shared by mock and live clients)
- Type/utility exports from `mappers.ts`
- Error classes from `errors.ts`
- Mock-only developer controls (from `mock-boundary.ts`):
  - `resetMockData()`
  - `applyMockScenario()`
  - `replayMockEvent()`
  - `setMockRoleMutationFailure()`
  - `setMockMetaVersion()`

**Consumer Contract:**
All application code (components, pages, tests) must import from `@/lib/api`. Never import from internal modules like `./mock.ts` or `./live.ts` in application code. The public surface provides the only stable boundary; internal module organization can change without breaking consumer contracts.

---

### `lib/api/mock-boundary.ts` — Stable Boundary for Mock-Only Functions

**Responsibility:** Wraps and re-exports mock-only developer controls, keeping the public surface deliberately small.

**What it exports:**
- `createMockAccessApi(address?, communityId?)` — Factory (not exported to `index.ts`, for internal use only)
- Re-exports of developer controls from `mock.ts`:
  - `resetMockData()`
  - `applyMockScenario()`
  - `replayMockEvent()`
  - `setMockMetaVersion()`
  - `setMockRoleMutationFailure()`

**Design principle:** Application code receives only what it needs — no `MockAccessApi` class constructor, no internal storage APIs, no scenario enum. This boundary prevents coupling to implementation details while exposing enough for meaningful developer testing.

---

### `lib/api/mock.ts` — Implementation: Composition & Re-exports

**Responsibility:** Thin aggregation point. `MockAccessApi` composes focused, domain-scoped modules under `lib/api/mock/`, and every historical public export (`MockAccessApi`, `getCommunityState()`, `communityStates`, developer controls, etc.) is re-exported so existing imports keep working.

The implementation is deliberately split so a structural mistake in one domain cannot break the whole API layer:

| Module | Responsibility |
| --- | --- |
| `mock/fixtures.ts` | Fixture/seeded data (communities, members, policies, webhook events, connections, reports) + the mutable social/moderation stores |
| `mock/state.ts` | In-memory per-community store (`communityStates`, `getCommunityState()`, `ensureAddress()`) + persistence orchestration (`initPromise`, `schedulePersist()`) |
| `mock/session.ts` | SIWE endpoints, nonce handling, and the `cookie`-auth-mode session-cookie simulation |
| `mock/core.ts` | Meta/community/resource/policy reads and wallet verification |
| `mock/members.ts` | Member reads and self-service profile mutation |
| `mock/analytics.ts` | Admin analytics summary + the `AnalyticsDataSource` surface |
| `mock/webhooks.ts` | Webhook feed, event replay, admin event log |
| `mock/approvals.ts` | Role/policy mutations and the multi-approval pending-action flow |
| `mock/social.ts` | Connections, privacy settings, blocking |
| `mock/moderation.ts` | Moderation report queue |
| `mock/governance.ts` | Proposals and weighted voting |
| `mock/controls.ts` | Fault-injection knobs (`setMockRoleMutationFailure()`, `setMockResourceFetchFailure/Delay()`) and the API-version override |
| `mock/scenarios.ts` | Scenario presets and `resetMockData()` |

**Behavior (Simulation Logic):**
- **SIWE simulation:** `getNonce()`, `siweVerify()`, `siweLogout()` (no real cryptography) — `mock/session.ts`
- **Session state:** Mock cookie reading/writing for `cookie` auth mode — `mock/session.ts`
- **Scenario presets:** Scripted test scenarios (active member, expired member, denied access, etc.) — `mock/scenarios.ts`
- **Event replay:** Replay webhook events (e.g., for testing event-driven UI updates) — `mock/webhooks.ts`
- **Failure injection:** `setMockRoleMutationFailure()`, `setMockResourceFetchFailure()`, `setMockResourceFetchDelay()` — `mock/controls.ts`
- **Version override:** `setMockMetaVersion()` — `mock/controls.ts`

**MockAccessApi class:** Implements the `AccessApi` interface by forwarding each method to the matching domain module:
- Read methods: `getSession()`, `getCommunity()`, `listMembers()`, `getMembership()`, etc.
- Write methods: `assignRole()`, `updatePolicy()`, `updateProfile()`, etc.
- SIWE methods: `getNonce()`, `siweVerify()`, `siweLogout()`
- Analytics surface: `analytics` property built by `mock/analytics.ts`

**Storage:** Delegates to `mock-storage.ts` for persistence via IndexedDB (with localStorage fallback).

---

### `lib/api/mock-storage.ts` — Mock State Persistence

**Responsibility:** Manage saving/loading/clearing mock state from IndexedDB (with localStorage fallback).

**Exports:**
- `loadPersistedState()` — Load saved mock state from storage
- `persistState(state)` — Save mock state asynchronously
- `clearPersistedState()` — Clear all stored mock data
- `LS_KEY` — Local storage key constant (for tests that need to validate storage)

**Note:** This module is internal; application code never directly calls these functions. Persistence is managed automatically by `MockAccessApi` during mutations and triggered by `resetMockData()`.

---

### `lib/api/types.ts` — Shared Type Definitions

**Responsibility:** Define the `AccessApi` interface and data models.

**Status:** Auto-generated from OpenAPI schema (`test/fixtures/openapi.json`) via `npm run sync-types`.

**Key exports:**
- `AccessApi` interface — Defines the contract all API clients (mock and live) must implement
- Data types: `Community`, `Resource`, `AccessPolicy`, `MemberRow`, `Membership`, `Role`, `MembershipTier`, `WebhookEventLog`, etc.
- Zod schemas for validation (e.g., `MembershipSchema`, `ResourceSchema`)

**Design principle:** Types are shared by mock and live implementations. If a type changes, both clients must adapt. This is enforced by the interface contract.

---

### `lib/api/live.ts` — Live Backend Integration

**Responsibility:** HTTP-based API client for live `guildpass-core` backend.

**Exports:**
- `LiveAccessApi` class — Implements `AccessApi` interface, making HTTP requests to the backend

**Relationship to mock:** Neither `live.ts` nor `mock.ts` import each other. Both implement the same `AccessApi` interface, allowing seamless switching via `getApi()` based on `NEXT_PUBLIC_MOCK_MODE`.

---

## Data Flow: How Components Use the API

```
Component (e.g., components/nav.tsx)
    ↓ imports
@/lib/api.index.ts
    ↓ calls getApi()
    ├─ if NEXT_PUBLIC_MOCK_MODE=true → createMockAccessApi() from mock-boundary.ts
    │   ↓ instantiates
    │   MockAccessApi from mock.ts
    │   └─ reads/writes fixture data from mock-storage.ts
    └─ else → LiveAccessApi from live.ts
        ↓ makes HTTP requests to guildpass-core
```

**Key point:** Components never directly reference `MockAccessApi`, `mock-storage.ts`, or fixture constants. This isolation means:
- Fixture data can be reorganized without affecting consumers
- Mock implementation details (storage strategy, scenario logic) can evolve without breaking imports
- Adding new dev-only controls (e.g., `setMockStatusCode()`) only requires changes to `mock.ts` and `mock-boundary.ts`, not consumer code

---

## Developer Controls (Mock-Only)

These functions are exported to `lib/api/index.ts` for use in developer UI and tests:

### `resetMockData()`
Clears all member, resource, policy, and event data and restores defaults.

**Used by:**
- `/developer` page (manual reset button)
- E2E tests (test fixture setup)

### `applyMockScenario(scenario, address?)`
Applies a scripted test scenario (e.g., "active member", "expired member", "denied resource").

**Scenarios:**
- `active-member` — Standard tier user with no special constraints
- `expired-member` — User with expired membership
- `denied-resource` — Free tier user with denied access to premium content
- `admin-session-expired` — User to test SIWE session expiry recovery
- `no-roles` — Member with no roles assigned
- `multiple-communities` — Member active across several communities

**Used by:**
- `/developer` page (scenario selector)
- Tests needing specific membership states

### `replayMockEvent(eventId)`
Replays a webhook event, triggering any downstream event-driven UI updates.

**Used by:**
- Admin event log (replay button)
- Tests of event-driven behavior

### `setMockRoleMutationFailure(shouldFail)`
Toggle whether role assignment mutations fail.

**Used by:**
- Error handling tests
- UI testing for failure states

### `setMockMetaVersion(version)`
Override the mock API's reported version for compatibility testing.

**Used by:**
- Version compatibility tests

---

## Fixture Maintenance Rules

When modifying fixtures in `mock/fixtures.ts`:

1. **Changes are internal only** — Fixture constants are consumed by the mock domain modules only, never application code.
2. **Preserve defaults** — Default fixtures represent the "reset" state. `resetMockData()` restores them; any changes should be intentional.
3. **Seed stability** — The 50,000 synthetic members are generated deterministically; changing the seed names or generation logic affects all downstream member lookups and pagination tests.
4. **Scenario implications** — Fixture additions affect all scenarios. If adding a new resource, consider whether scenarios should reference it.
5. **Type alignment** — Ensure fixture data conforms to types in `types.ts`. Zod schemas help catch drift during testing.
6. **Mutable stores** — `mockConnections`, `mockPrivacySettings`, and `mockReports` are top-level `let` bindings. Reassign them via the exported setters in `fixtures.ts` (reassigning an imported binding is forbidden by ESM module semantics); content/property mutations are fine from anywhere.

---

## Behavior Implementation Rules

When adding new behavior to the mock (e.g., new test failure mode):

1. **Implement in the matching domain module** — Add the logic to the `lib/api/mock/` module for that domain (e.g., governance → `mock/governance.ts`), and forward to it from the `MockAccessApi` method in `mock.ts`. If a new domain appears, give it its own focused module under `lib/api/mock/`.
2. **Expose toggles via `mock-boundary.ts`** — If developers need to enable/disable the behavior, export a setter (e.g., `setMockXyzFail()`).
3. **Document in this file** — Add the new control to the "Developer Controls" section.
4. **Test both modes** — E2E tests should verify the behavior works in both mock and live modes (or skip live if the failure cannot be easily reproduced).

---

## Example: Tracing a Consumer's API Call

**Scenario:** Admin assigns a role in `/admin/members`.

1. Component calls `api.assignRole(memberAddress, role)` where `api = getApi(address, token)`
2. `getApi()` returns `MockAccessApi` (or `LiveAccessApi` in live mode)
3. `MockAccessApi.assignRole()`:
   - Checks if `mockRoleMutationFailure` is set; if so, throws `AuthError`
   - Otherwise, finds the member in `communityState.memberStore` and adds the role
   - Persists the updated state via `persistState()` (to IndexedDB/localStorage)
   - Returns the updated `MemberRow`
4. Component displays success/error based on result
5. If developer calls `setMockRoleMutationFailure(true)`, all subsequent role assignments fail until toggled back

The entire flow is transparent to the component; it only sees the `AccessApi` interface, never the mock implementation.

---

## Migration and Refactoring Guidance

### Safe Changes
These changes can happen without breaking consumers:
- Reorganizing fixture data or moving a mock domain into its own module under `lib/api/mock/` (e.g., adding a dedicated module for a new API domain)
- Adding new developer controls to `mock-boundary.ts` and re-exporting them from `index.ts`
- Changing mock storage backend (e.g., from IndexedDB to SQLite) as long as `persistState()`/`loadPersistedState()` signature stays the same
- Optimizing fixture generation (e.g., lazy-loading the 50k members)

### Risky Changes
These require consumer updates:
- Adding/removing methods from `AccessApi` interface (affects both mock and live implementations)
- Changing data model shapes (affects all consumers expecting the old schema)
- Removing an exported developer control function (breaks tests using it)

---

## Related Documentation

- [Mock scenario presets](./mock-scenarios.md) — Detailed test scenarios and their membership states
- [Architecture](./architecture.md) — Full request/response flow, SIWE sequence, integration gateway
- [README: Feature Flags](../README.md#feature-flags) — Developer controls in the `/developer` UI
