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

### `lib/api/mock.ts` — Implementation: Fixtures + Behavior

**Responsibility:** Core mock API implementation split into two concerns:

#### Fixtures (Static Data)
These are default/seeded data sets that populate the mock store:
- `DEFAULT_COMMUNITY` — Demo community configuration
- `DEFAULT_RESOURCES` — Gated resource catalog (alpha, pro-reports, mem-updates)
- `DEFAULT_POLICIES` — Access policies including composable rule examples
- `DEFAULT_WEBHOOK_EVENTS` — Example webhook event log entries
- `DEFAULT_MEMBER_STORE` — 50,000 synthetic seeded members with realistic names, tiers, roles

Fixtures initialize the mock state and are restored by `resetMockData()`. They are never directly imported by application code; they live in `mock.ts` to keep implementation details private.

#### Behavior (Simulation Logic)
These functions implement mock API behaviors:
- **SIWE simulation:** `getNonce()`, `siweVerify()`, `siweLogout()` (no real cryptography)
- **Session state:** Mock cookie reading/writing for `cookie` auth mode
- **Scenario presets:** Apply scripted test scenarios (active member, expired member, denied access, etc.)
- **Event replay:** Replay webhook events (e.g., for testing event-driven UI updates)
- **Failure injection:** `setMockRoleMutationFailure()`, `setMockResourceFetchFailure()`, `setMockResourceFetchDelay()` for failure mode testing
- **Version override:** `setMockMetaVersion()` for API compatibility testing

**MockAccessApi class:** Implements the `AccessApi` interface, providing:
- Read methods: `getSession()`, `getCommunity()`, `getMembers()`, `getMembership()`, etc.
- Write methods: `assignRole()`, `updatePolicy()`, `updateProfile()`, etc.
- SIWE methods: `getNonce()`, `siweVerify()`, `siweLogout()`

**Internal helpers:**
- `ensureAddress()` — Ensures a member record exists
- `randomHex()` — Generates mock nonces
- `throwMockUnauthorized()` — Simulates auth failures
- Community state management via `getCommunityState()`, `communityStates`

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

When modifying fixtures in `mock.ts`:

1. **Changes are internal only** — Never export fixture constants. They are consumed by `MockAccessApi` methods only.
2. **Preserve defaults** — Default fixtures represent the "reset" state. `resetMockData()` restores them; any changes should be intentional.
3. **Seed stability** — The 50,000 synthetic members are generated deterministically; changing the seed names or generation logic affects all downstream member lookups and pagination tests.
4. **Scenario implications** — Fixture additions affect all scenarios. If adding a new resource, consider whether scenarios should reference it.
5. **Type alignment** — Ensure fixture data conforms to types in `types.ts`. Zod schemas help catch drift during testing.

---

## Behavior Implementation Rules

When adding new behavior to the mock (e.g., new test failure mode):

1. **Implement in `MockAccessApi` methods** — Behavior lives where it's called, not in separate helper files.
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
- Reorganizing fixture data within `mock.ts` (e.g., moving defaults into a separate file)
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
