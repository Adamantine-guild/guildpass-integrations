# Assumptions

## Baseline restoration for issue #146 branch (2026-07-17)

The test suite on `main` could not compile (stray `vitest` imports; alias `@/` imports
emitted as unresolvable CJS requires in the node:test build). Restoring it surfaced
latent failures in tests that had never actually run. Decisions taken:

1. **`test/integration-health.test.ts` whitespace case** — the committed test set
   `INTEGRATION_API_KEY = '***'` (a non-whitespace placeholder) while asserting the
   "whitespace → not configured" behavior. Assumed the test name states the intent:
   the value was changed to a real whitespace string and `isGatewayConfigured()` now
   trims (`Boolean(key?.trim())`). Server-side only; a whitespace-only key could never
   have produced a working gateway client.

2. **`test/features.test.ts` expectations aligned to shipped config** — the test
   expected `adminPolicies`/`resources` to default to `true` in live mode and
   malformed flag values to fall back to defaults. `lib/config.ts` (older than the
   test, and matching CLAUDE.md: flags default to true *in mock mode only*) defaults
   them to `false` in live mode and treats any value other than `"true"` as false.
   The tests never passed as written; they were updated to assert the shipped,
   documented behavior rather than changing production feature gating.

3. **`test/fixtures/live-api-responses.ts` parity refresh** — mock data gained
   profile badges and resource `content` blocks (resource-content-renderer PR)
   without the live fixtures being updated, breaking the mock/live contract tests.
   Fixtures were extended to match; no runtime code changed.

4. **Alias imports in the test-compile closure** — `@/…` imports in files compiled
   into `test-dist` were converted to relative paths (identical resolution for the
   Next build, resolvable under plain node). Type-only alias imports were left alone
   (erased at compile time).

5. **Out of scope: pre-existing `main` breakage** — ~35 typecheck errors and 3 lint
   errors remain on `main` from an unrelated bad merge (`7a93fa5` reverted
   `lib/wallet/providers.tsx` to an old SIWE context shape and gutted
   `components/admin-guard.tsx`; `Select`/`Label`/`EmptyState`/`mapVerificationState`
   usages lost their imports/definitions; readonly wagmi config mismatch). Confirmed
   with the user (2026-07-17) that this branch fixes only its own scope; the merge
   regression needs its own PR. Gate used instead: `npm test` fully green + zero new
   typecheck/lint errors in files touched by this branch.

   Also pre-existing on `main` (verified against files untouched by this branch):
   `npm run check-types` fails (drift between `lib/api/types.ts` and
   `test/fixtures/openapi.json`), and `npm run build` fails
   (`@/components/ui/label` module missing, imported by `app/developer/page.tsx`).
