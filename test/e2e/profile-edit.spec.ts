/**
 * test/e2e/profile-edit.spec.ts
 *
 * End-to-end happy-path test for rich profile customization (#254):
 * connect wallet → sign in → edit profile → save → changes are reflected
 * both on the dashboard and on the public /members/[address] view.
 *
 * Requires the dev server running with NEXT_PUBLIC_MOCK_MODE=true and
 * NEXT_PUBLIC_FEATURE_PROFILES=true (the flag defaults to false — see
 * README.md's Feature Flags section).
 *
 * Run with: npm run test:e2e -- profile-edit.spec.ts
 *
 * KNOWN ISSUE (pre-existing, not specific to this spec): as of this writing,
 * injectMockWalletConnector()'s window.ethereum polyfill never actually
 * reaches a connected wagmi state in this environment — the app's CSP
 * (Content-Security-Policy, configured in next.config.mjs) rejects the
 * eval-based path Playwright's addInitScript relies on here, so
 * window.ethereum ends up undefined and the "Connect Wallet" button never
 * transitions past its initial state. This reproduces identically on the
 * pre-existing test/e2e/siwe-flow.spec.ts "happy path" test, so it is a gap
 * in the shared wallet-mocking harness (helpers.ts), not something
 * introduced here. This spec is written to the same conventions as
 * siwe-flow.spec.ts and will start passing once that harness gap is fixed.
 */

import { test, expect } from '@playwright/test'
import { injectMockWalletConnector, clearAuthSession } from './helpers'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'

test.describe('Profile edit flow (E2E) — #254', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL)
    await clearAuthSession(page)
    await injectMockWalletConnector(page, { address: ADDRESS, isConnected: true })
  })

  test('connect → sign in → edit profile → save → reflected on dashboard and public profile', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`)

    await page.locator('button:has-text("Connect Wallet")').click()

    // The editor is read-only until the member signs in with Ethereum —
    // this reuses the same SIWE session as admin actions, just without the
    // admin role requirement.
    const signInButton = page.locator('button:has-text("Sign In to Edit Profile")')
    await signInButton.waitFor({ state: 'visible', timeout: 10000 })
    await signInButton.click()

    const editButton = page.locator('button:has-text("Edit Profile")')
    await editButton.waitFor({ state: 'visible', timeout: 10000 })
    await editButton.click()

    await page.getByLabel('Display Name').fill('Ada Test')
    await page.getByLabel('Bio').fill('Building on GuildPass.')
    await page.getByLabel('Avatar URL').fill('https://example.com/avatar.png')

    await page.locator('button:has-text("Save Profile")').click()

    await expect(page.locator('text=Profile saved.')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Ada Test')).toBeVisible()
    await expect(page.locator('text=Building on GuildPass.')).toBeVisible()

    // Give the mock API's debounced localStorage persistence a moment to
    // flush before navigating away — the public profile page reloads the
    // mock store from scratch on full navigation.
    await page.waitForTimeout(500)

    // Follow the link added alongside the editor rather than constructing
    // the URL directly, so this also exercises that navigation entry point.
    await page.locator(`a[href="/members/${ADDRESS}"]`).click()

    await expect(page).toHaveURL(new RegExp(`/members/${ADDRESS}$`))
    await expect(page.locator('text=Ada Test')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Building on GuildPass.')).toBeVisible()
  })
})
