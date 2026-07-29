/**
 * test/e2e/admin-members-search-filters.spec.ts
 *
 * End-to-end coverage for the admin member search/role/tier filters that
 * the SSR-only unit test harness (node:test + renderToStaticMarkup, see
 * test/member-filters.test.ts) cannot exercise: real typing/selecting,
 * the debounce delay, and the "Clear filters" click.
 *
 * Run with: npm run test:e2e -- admin-members-search-filters.spec.ts
 *
 * KNOWN ISSUE (pre-existing, not specific to this spec — see
 * test/e2e/profile-edit.spec.ts for the original writeup): the mock wallet
 * connector's window.ethereum polyfill does not currently reach a connected
 * wagmi state in this environment because of CSP restrictions on
 * Playwright's addInitScript, so AdminGuard-gated routes like this one never
 * get past the initial "Connect Wallet" state. This spec is written to the
 * same conventions as profile-edit.spec.ts / siwe-flow.spec.ts and will
 * start passing once that shared harness gap is fixed.
 */

import { test, expect } from '@playwright/test'
import { injectMockWalletConnector, clearAuthSession } from './helpers'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'
// Mock-mode admin seeding (lib/api/mock.ts MOCK_ADMIN_ADDRESS convention) —
// matches the address AdminGuard expects to already hold the admin role.
const COMMUNITY_SLUG = 'guildpass-demo'

test.describe('Admin member search/filter controls (E2E)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL)
    await clearAuthSession(page)
    await injectMockWalletConnector(page, { address: ADDRESS, isConnected: true })
    await page.goto(`${BASE_URL}/${COMMUNITY_SLUG}/admin/members`)
  })

  test('typing a search term debounces before narrowing the list', async ({ page }) => {
    const search = page.getByLabel('Search members')
    await search.waitFor({ state: 'visible', timeout: 10000 })

    const rowCountBefore = await page.locator('[aria-label^="Select 0x"]').count()

    await search.fill('zzz-no-such-member-zzz')
    // Immediately after typing, filtering should not have applied yet.
    expect(await page.locator('[aria-label^="Select 0x"]').count()).toBe(rowCountBefore)

    await expect(page.getByText('No members match your current filters.')).toBeVisible({ timeout: 2000 })
  })

  test('role and tier filters combine with search, and Clear filters restores the full list', async ({ page }) => {
    const search = page.getByLabel('Search members')
    await search.waitFor({ state: 'visible', timeout: 10000 })

    await page.getByLabel('Role').selectOption('admin')
    await page.getByLabel('Tier').selectOption('free')
    await search.fill('nonexistent-combo')

    await expect(page.getByText('No members match your current filters.')).toBeVisible({ timeout: 2000 })

    await page.getByRole('button', { name: 'Clear filters' }).click()

    await expect(search).toHaveValue('')
    await expect(page.getByLabel('Role')).toHaveValue('all')
    await expect(page.getByLabel('Tier')).toHaveValue('all')
    await expect(page.getByText('No members match your current filters.')).not.toBeVisible()
  })
})
