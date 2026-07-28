/**
 * test/e2e/helpers.ts
 *
 * Helper utilities for end-to-end testing of the SIWE sign-in flow.
 * Includes utilities for mocking wagmi connectors and managing test state.
 */

import { Page } from '@playwright/test'

/**
 * Mock wallet connector configuration for Playwright tests.
 * Simulates a connected wallet that can sign messages without a real provider.
 */
export interface MockWalletConfig {
  /** The Ethereum address to simulate. */
  address: string
  /** Whether the wallet is initially connected. */
  isConnected: boolean
  /** Mock signed message to return. Defaults to a test signature. */
  mockSignature?: string
}

const DEFAULT_MOCK_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'
const DEFAULT_MOCK_SIGNATURE = '0xmock-signature-' + Math.random().toString(16).slice(2)

/**
 * Inject a mock wagmi connector into the page.
 * This allows tests to simulate wallet connections without MetaMask or a real provider.
 *
 * The injected mock provides:
 * - A simulated connected account
 * - Message signing capability via `signMessage()`
 * - No actual blockchain interaction
 */
export async function injectMockWalletConnector(
  page: Page,
  config: Partial<MockWalletConfig> = {},
): Promise<void> {
  const {
    address = DEFAULT_MOCK_ADDRESS,
    isConnected = true,
    mockSignature = DEFAULT_MOCK_SIGNATURE,
  } = config

  await page.addInitScript(
    ({ address, isConnected, mockSignature }) => {
      // Mock wagmi's internal connector by injecting a provider-like object
      (window as any).__MOCK_WAGMI_CONFIG__ = {
        address,
        isConnected,
        chainId: 1, // mainnet
        mockSignature,
      }

      // Inject a minimal EIP-1193 provider that supports eth_signMessage
      // This allows wagmi to detect an available wallet provider
      const mockProvider = {
        request: async (args: any) => {
          if (args.method === 'eth_accounts') {
            return isConnected ? [address] : []
          }
          if (args.method === 'eth_chainId') {
            return '0x1' // mainnet
          }
          if (args.method === 'personal_sign') {
            // Simulate message signing
            return mockSignature
          }
          if (args.method === 'eth_sign') {
            return mockSignature
          }
          throw new Error(`Unsupported method: ${args.method}`)
        },
        on: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
        removeListener: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
      };

      // Inject the mock provider into the window
      ;(window as any).ethereum = mockProvider
    },
    { address, isConnected, mockSignature },
  )
}

/**
 * Set the mock session state for the API.
 * This controls how the mock API responds to SIWE verification.
 *
 * States:
 * - "default" — siweVerify returns a valid token (1 hour expiry)
 * - "expired" — siweVerify returns an already-expired token with a valid refresh token
 * - "unauthenticated" — siweVerify always throws a 401 error
 */
export async function setMockSessionState(
  page: Page,
  state: 'default' | 'expired' | 'unauthenticated',
): Promise<void> {
  const envValue = state === 'default' ? '' : state
  await page.addInitScript(
    ({ envValue }) => {
      (window as any).__MOCK_SESSION_STATE__ = envValue
    },
    { envValue },
  )
}

/**
 * Wait for the sign-in button to appear and be clickable.
 * Returns true if the button was found, false if a timeout occurs.
 */
export async function waitForSignInButton(page: Page, timeout = 10000): Promise<boolean> {
  try {
    await page.locator('button:has-text("Sign In")').first().waitFor({ state: 'visible', timeout })
    return true
  } catch {
    return false
  }
}

/**
 * Wait for the authenticated state to be visible (session loaded).
 * Looks for a user menu or address display that appears when logged in.
 */
export async function waitForAuthenticatedState(page: Page, timeout = 10000): Promise<boolean> {
  try {
    // Look for either an address display or a logged-in indicator
    await page
      .locator('[id*="address"], [data-testid*="user"], button:has-text(/0x[0-9a-f]{4}/i)')
      .first()
      .waitFor({ state: 'visible', timeout })
    return true
  } catch {
    return false
  }
}

/**
 * Wait for the session expired banner to appear.
 * This is the inline re-auth banner shown when a 401 occurs.
 */
export async function waitForSessionExpiredBanner(page: Page, timeout = 10000): Promise<boolean> {
  try {
    await page.locator('#session-expired-banner').waitFor({ state: 'visible', timeout })
    return true
  } catch {
    return false
  }
}

/**
 * Click the re-authenticate button in the session expired banner.
 */
export async function clickReauthButton(page: Page): Promise<void> {
  await page.locator('#session-expired-banner button:has-text("Sign In")').click()
}

/**
 * Navigate to the admin page (members section).
 */
export async function navigateToAdminMembers(page: Page, baseUrl = 'http://localhost:3000'): Promise<void> {
  await page.goto(`${baseUrl}/admin/members`)
}

/**
 * Navigate to the admin page root.
 */
export async function navigateToAdmin(page: Page, baseUrl = 'http://localhost:3000'): Promise<void> {
  await page.goto(`${baseUrl}/admin`)
}

/**
 * Get the current address from sessionStorage.
 * Useful for asserting that the session was persisted correctly.
 */
export async function getStoredAddress(page: Page): Promise<string | null> {
  const sessionData = await page.evaluate(() => {
    const raw = window.sessionStorage.getItem('guildpass:siwe-session')
    return raw ? JSON.parse(raw) : null
  })
  return sessionData?.address || null
}

/**
 * Clear the session storage and local storage.
 * Useful for resetting state between tests.
 */
export async function clearAuthSession(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.sessionStorage.removeItem('guildpass:siwe-session')
    window.localStorage.clear()
  })
}

/**
 * Simulate a 401 error on the next API call to the admin/members endpoint.
 * This triggers the re-auth banner flow.
 */
export async function simulateSessionExpiry(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Store the original fetch
    const originalFetch = window.fetch
    let intercepted = false

    // Replace fetch to intercept member list calls
    ;(window as any).fetch = async (...args: any[]) => {
      const [url] = args
      const urlStr = typeof url === 'string' ? url : url.toString()

      // Intercept the members endpoint on first call, then restore
      if (!intercepted && urlStr.includes('/api/integration/members')) {
        intercepted = true
        return new Response(
          JSON.stringify({
            status: 401,
            code: 'unauthorized',
            safeMessage: 'Session expired. Please sign in again.',
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      return originalFetch.apply(window, args as any)
    }
  })
}

/**
 * Assert that the user is authenticated by checking the session.
 * Returns true if an active session exists.
 */
export async function isUserAuthenticated(page: Page): Promise<boolean> {
  const session = await page.evaluate(() => {
    const raw = window.sessionStorage.getItem('guildpass:siwe-session')
    if (!raw) return null
    const data = JSON.parse(raw)
    // Check if token has not expired
    return new Date(data.expiresAt).getTime() > Date.now() ? data : null
  })
  return !!session
}

/**
 * Wait for an element with specific text to appear.
 * Useful for asserting UI state changes.
 */
export async function waitForText(
  page: Page,
  text: string | RegExp,
  timeout = 10000,
): Promise<boolean> {
  try {
    await page.locator(`text=${text}`).first().waitFor({ state: 'visible', timeout })
    return true
  } catch {
    return false
  }
}
