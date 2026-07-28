# E2E Test Suite for SIWE Sign-In Flow

This directory contains end-to-end tests for the SIWE (Sign In With Ethereum) sign-in flow, covering the full authentication workflow including wallet connection, message signing, session persistence, and re-authentication after session expiry.

## Overview

The test suite validates:

- **Happy path**: Wallet connect → sign-in → authenticated state
- **Session persistence**: Session survives across page navigations
- **Storage**: Tokens and addresses persist in sessionStorage
- **Refresh tokens**: Valid refresh tokens for silent renewal
- **401 handling**: Session expired banner appears after 401 errors
- **Re-auth flow**: 401 → banner → re-authenticate → recovery
- **Admin authorization**: Protected actions require valid authentication
- **Logout**: Session clears properly on logout
- **Cross-tab sync**: BroadcastChannel propagates sessions to peer tabs

## Running the Tests

### Prerequisites

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the dev server in mock mode:
   ```bash
   NEXT_PUBLIC_API_MODE=mock npm run dev
   ```

3. In a separate terminal, run the tests:
   ```bash
   npm run test:e2e
   ```

### Test Modes

- **Headless mode** (default):
  ```bash
  npm run test:e2e
  ```

- **UI mode** (visual debugging):
  ```bash
  npm run test:e2e:ui
  ```

- **Specific test**:
  ```bash
  npx playwright test siwe-flow.spec.ts --grep "happy path"
  ```

- **Debug mode** (step through with inspector):
  ```bash
  npx playwright test --debug
  ```

## Test Architecture

### Mock Wallet Connector

The tests use a mock EIP-1193 provider injected via `injectMockWalletConnector()` that simulates:
- Connected wallet state
- Message signing capability
- No blockchain interaction

### Mock API Session States

The mock API supports three session states configured via environment or helper functions:

- **`default`**: Sign-in returns a valid 1-hour token + 7-day refresh token
- **`expired`**: Sign-in returns an already-expired token (tests renewal flow)
- **`unauthenticated`**: Sign-in always throws a 401 (tests error handling)

These correspond to the presets in `lib/api/mock.ts`:
```typescript
NEXT_PUBLIC_MOCK_SESSION_STATE='expired'     // Test expired session recovery
NEXT_PUBLIC_MOCK_SESSION_STATE='unauthenticated'  // Test auth rejection
```

### Helper Functions

See [helpers.ts](./helpers.ts) for utility functions:

- `injectMockWalletConnector()` — Inject a mock EIP-1193 provider
- `setMockSessionState()` — Control mock API behavior
- `waitForSignInButton()` — Wait for sign-in UI
- `waitForAuthenticatedState()` — Wait for logged-in UI
- `waitForSessionExpiredBanner()` — Wait for re-auth banner
- `isUserAuthenticated()` — Check active session
- `simulateSessionExpiry()` — Trigger 401 on next request
- `navigateToAdmin()` / `navigateToAdminMembers()` — Navigate to protected pages

## Key Test Cases

### Happy Path

```typescript
test('navigate → sign in → authenticated', async ({ page }) => {
  // Navigate to admin
  // Click sign-in button
  // Verify user is authenticated with stored session
})
```

### 401 → Banner → Recovery

```typescript
test('401 → banner → re-auth → recovery flow', async ({ page }) => {
  // Set mock to return expired token
  // Sign in (gets expired token)
  // Navigate to admin (triggers 401)
  // Verify banner appears
  // Switch mock to valid tokens
  // Click re-auth button
  // Verify authenticated again
})
```

## Integration with Existing Tests

These E2E tests **complement** the existing unit tests in `test/`:
- Unit tests verify individual components (siwe-session reducer, session storage, etc.)
- E2E tests verify the full browser-level flow including wagmi integration, UI state, and persistence

Both test suites run independently:
- Unit tests: `npm run test`
- E2E tests: `npm run test:e2e`

## Troubleshooting

### Tests timeout waiting for sign-in button

**Issue**: The sign-in button is not found or takes too long to appear.

**Solution**:
- Ensure dev server is running: `npm run dev`
- Check that `NEXT_PUBLIC_API_MODE=mock` is set
- Increase timeout: `waitForSignInButton(page, 15000)`

### Session not persisting across navigations

**Issue**: Session exists after sign-in but disappears after navigation.

**Solution**:
- Check that sessionStorage is not being cleared
- Verify the session has a valid `expiresAt` in the future
- Ensure wagmi connection state matches session address

### Mock connector not injecting

**Issue**: Wallet connection fails in tests.

**Solution**:
- Ensure `injectMockWalletConnector()` is called in `beforeEach()`
- Verify the injected address matches test expectations
- Check browser console for errors via `page.on('console')`

### Re-auth banner doesn't appear

**Issue**: After 401, the banner is not rendered.

**Solution**:
- Set mock state to `'expired'` before navigating
- Ensure the admin member page triggers an API call that receives 401
- Wait longer for async state updates: `await page.waitForTimeout(2000)`

## Browser Support

Tests are configured to run on:
- **Chromium** (default, recommended)
- **Firefox**
- **Webkit** (Safari)

Mobile and other configurations can be enabled in `playwright.config.ts`.

## CI/CD Integration

**Note**: These tests are designed for local development and are not wired into CI/CD. They can be run locally without dependencies on external infrastructure.

To enable CI/CD integration later:
1. Set `forbidOnly: true` in `playwright.config.ts` (already set)
2. Configure GitHub Actions or similar to run `npm run test:e2e`
3. Consider using a headless browser and artifact capture for debugging

## Future Improvements

- [ ] Test with real wallet connectors (MetaMask, WalletConnect) in a local environment
- [ ] Add performance metrics (time to sign-in, token refresh latency)
- [ ] Test with real backend API (currently mock-only)
- [ ] Add visual regression testing
- [ ] Test mobile wallet flows (WalletConnect)
