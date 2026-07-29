/**
 * test/e2e/siwe-flow-cookie-mode.spec.ts
 *
 * End-to-end tests for the SIWE flow in cookie auth mode (dual-mode
 * readiness for the httpOnly-cookie migration — see
 * docs/http-only-cookie-migration.md). Mirrors the happy-path coverage in
 * siwe-flow.spec.ts (bearer mode), but every assertion here proves the
 * cookie-mode-specific security invariant: sessionStorage never receives a
 * bearer token, at any point in the flow.
 *
 * Requires the dev server to be started with NEXT_PUBLIC_AUTH_MODE=cookie
 * (NEXT_PUBLIC_AUTH_MODE is a NEXT_PUBLIC_* var, inlined at server-start /
 * build time — a server already running in bearer mode will NOT pick this
 * up, and playwright.config.ts's webServer reuses an already-running server
 * by default outside CI). Run with:
 *
 *   NEXT_PUBLIC_AUTH_MODE=cookie NEXT_PUBLIC_MOCK_MODE=true \
 *     npx playwright test test/e2e/siwe-flow-cookie-mode.spec.ts
 *
 * lib/api/mock.ts simulates the httpOnly cookie with a non-httpOnly
 * `gp_mock_session` document.cookie entry (mock JS cannot set a real
 * httpOnly cookie either) — see getMockSessionCookie() in ./helpers.
 */

import { test, expect } from '@playwright/test'
import {
  injectMockWalletConnector,
  setMockSessionState,
  waitForSignInButton,
  waitForAuthenticatedState,
  navigateToAdmin,
  navigateToAdminMembers,
  getSessionStorageEntry,
  getMockSessionCookie,
} from './helpers'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const DEFAULT_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'

test.describe('SIWE Sign-In Flow — cookie auth mode (E2E)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL)
    await page.evaluate(() => {
      window.sessionStorage.clear()
      document.cookie = 'gp_mock_session=; path=/; Max-Age=0'
    })

    await injectMockWalletConnector(page, {
      address: DEFAULT_ADDRESS,
      isConnected: true,
    })
    await setMockSessionState(page, 'default')
  })

  test('happy path: navigate → sign in → authenticated, without ever touching sessionStorage', async ({ page }) => {
    await navigateToAdmin(page, BASE_URL)
    await expect(page).toHaveTitle(/GuildPass/)

    // sessionStorage must be empty before sign-in.
    expect(await getSessionStorageEntry(page)).toBeNull()

    const signInVisible = await waitForSignInButton(page, 5000)
    if (signInVisible) {
      await page.locator('button:has-text("Sign In")').first().click()
    }

    const authenticated = await waitForAuthenticatedState(page, 10000)
    expect(authenticated).toBe(true)

    // The mock httpOnly-cookie simulation should now hold the session.
    const cookie = await getMockSessionCookie(page)
    expect(cookie).toBeTruthy()
    expect(decodeURIComponent(cookie ?? '')).toContain(DEFAULT_ADDRESS)

    // sessionStorage must STILL be empty after a successful sign-in — this
    // is the core cookie-mode invariant.
    expect(await getSessionStorageEntry(page)).toBeNull()
  })

  test('sessionStorage stays empty across sign-in, navigation, and reload', async ({ page }) => {
    await navigateToAdmin(page, BASE_URL)
    const signInVisible = await waitForSignInButton(page, 5000)
    if (signInVisible) {
      await page.locator('button:has-text("Sign In")').first().click()
    }
    await waitForAuthenticatedState(page, 10000)
    expect(await getSessionStorageEntry(page)).toBeNull()

    await navigateToAdminMembers(page, BASE_URL)
    await page.waitForLoadState('networkidle')
    expect(await getSessionStorageEntry(page)).toBeNull()

    await page.reload()
    await page.waitForLoadState('networkidle')
    expect(await getSessionStorageEntry(page)).toBeNull()
  })

  test('reload preserves the authenticated session via the session-status check (no sessionStorage involved)', async ({ page }) => {
    await navigateToAdmin(page, BASE_URL)
    const signInVisible = await waitForSignInButton(page, 5000)
    if (signInVisible) {
      await page.locator('button:has-text("Sign In")').first().click()
    }
    await waitForAuthenticatedState(page, 10000)
    const cookieBeforeReload = await getMockSessionCookie(page)
    expect(cookieBeforeReload).toBeTruthy()

    await page.reload()
    await page.waitForLoadState('networkidle')

    // The mock cookie survived the reload (real browser cookie semantics —
    // unlike sessionStorage-based hydration, this isn't a client re-read of
    // a client-written value; it's the same check a real page load would do
    // against the backend's session-status endpoint).
    const cookieAfterReload = await getMockSessionCookie(page)
    expect(cookieAfterReload).toBeTruthy()

    const stillAuthenticated = await waitForAuthenticatedState(page, 10000)
    expect(stillAuthenticated).toBe(true)
    expect(await getSessionStorageEntry(page)).toBeNull()
  })

  test('logout clears the mock cookie and sessionStorage remains empty throughout', async ({ page }) => {
    await navigateToAdmin(page, BASE_URL)
    const signInVisible = await waitForSignInButton(page, 5000)
    if (signInVisible) {
      await page.locator('button:has-text("Sign In")').first().click()
    }
    await waitForAuthenticatedState(page, 10000)
    expect(await getMockSessionCookie(page)).toBeTruthy()

    const logoutButton = page.locator('button:has-text("Logout"), button:has-text("Sign Out")').first()
    const isVisible = await logoutButton.isVisible().catch(() => false)

    if (isVisible) {
      await logoutButton.click()
      await page.waitForTimeout(1000)

      expect(await getMockSessionCookie(page)).toBeNull()
      expect(await getSessionStorageEntry(page)).toBeNull()
    }
  })
})
