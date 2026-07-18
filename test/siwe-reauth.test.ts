import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import './setup-env'
import {
  buildSiweMessage,
  deriveSessionStatus,
  initialSiweSessionState,
  siweSessionReducer,
  SiweSessionState,
} from '../lib/wallet/siwe-session'
import { MockAccessApi } from '../lib/api/mock'
import { ApiError, isApiError } from '../lib/api/errors'

const ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'

/**
 * The inline re-auth banner in the admin pages renders exactly when the
 * shared context derives an 'expired' status (see app/admin/members/page.tsx
 * and friends). This predicate mirrors that render condition.
 */
function bannerVisible(state: SiweSessionState, isConnected = true): boolean {
  return deriveSessionStatus(state, isConnected) === 'expired'
}

/** The 401 the live client raises for expired/rejected tokens (lib/api/live.ts). */
function unauthorizedError(): ApiError {
  return new ApiError({
    status: 401,
    code: 'unauthorized',
    safeMessage: 'Session expired. Please sign in again.',
  })
}

describe('inline re-auth banner (401 → re-auth → success)', () => {
  test('banner appears after a 401 and clears after successful re-auth', async () => {
    const api = new MockAccessApi(ADDRESS)

    // Initial sign-in
    let state = siweSessionReducer(initialSiweSessionState, { type: 'sign-in-start' })
    const firstSession = await api.siweVerify('message', '0xsignature')
    state = siweSessionReducer(state, { type: 'sign-in-success', session: firstSession })
    assert.equal(deriveSessionStatus(state, true), 'authenticated')
    assert.equal(bannerVisible(state), false)

    // A later admin call is rejected with 401 → the page calls markExpired()
    const err = unauthorizedError()
    assert.ok(isApiError(err) && err.code === 'unauthorized')
    state = siweSessionReducer(state, { type: 'mark-expired' })
    assert.equal(deriveSessionStatus(state, true), 'expired')
    assert.equal(bannerVisible(state), true)

    // Re-auth from the banner: the banner stays visible (with its
    // "Signing…" button) while the signature is in-flight …
    state = siweSessionReducer(state, { type: 'sign-in-start' })
    assert.equal(bannerVisible(state), true)

    // … and disappears immediately once verify succeeds, no reload needed.
    const secondSession = await api.siweVerify('message', '0xsignature')
    state = siweSessionReducer(state, { type: 'sign-in-success', session: secondSession })
    assert.equal(deriveSessionStatus(state, true), 'authenticated')
    assert.equal(bannerVisible(state), false)
    assert.equal(state.error, null)
    assert.equal(state.isSigningIn, false)
    assert.notEqual(state.authSession, null)
  })

  test('failed re-auth keeps the banner visible and surfaces the error', () => {
    let state = siweSessionReducer(initialSiweSessionState, { type: 'mark-expired' })
    state = siweSessionReducer(state, { type: 'sign-in-start' })
    state = siweSessionReducer(state, {
      type: 'sign-in-error',
      message: unauthorizedError().safeMessage,
    })
    assert.equal(bannerVisible(state), true)
    assert.equal(state.error, 'Session expired. Please sign in again.')
    assert.equal(state.isSigningIn, false)
  })

  test('a session past its expiresAt derives an expired status', () => {
    const state: SiweSessionState = {
      ...initialSiweSessionState,
      authSession: {
        isAuthenticated: true,
        token: 'stale-token',
        address: ADDRESS,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      },
    }
    assert.equal(deriveSessionStatus(state, true), 'expired')
  })

  test('wallet disconnect wins over the expired flag', () => {
    const state = siweSessionReducer(initialSiweSessionState, { type: 'mark-expired' })
    assert.equal(deriveSessionStatus(state, false), 'disconnected')
    assert.equal(bannerVisible(state, false), false)
  })

  test('sign-in success replaces a stale session and resets the expired flag', async () => {
    const api = new MockAccessApi(ADDRESS)
    const expired = siweSessionReducer(initialSiweSessionState, { type: 'mark-expired' })
    const session = await api.siweVerify('message', '0xsignature')
    const next = siweSessionReducer(expired, { type: 'sign-in-success', session })
    assert.equal(next.expired, false)
    assert.equal(next.authSession?.token, session.token)
  })
})

describe('buildSiweMessage', () => {
  test('produces the EIP-4361 layout with a single-line statement', () => {
    const message = buildSiweMessage({
      domain: 'localhost:3000',
      address: ADDRESS,
      statement: 'Sign in to GuildPass Admin',
      uri: 'http://localhost:3000',
      chainId: 1,
      nonce: 'abc123',
      issuedAt: '2026-01-01T00:00:00.000Z',
    })

    const lines = message.split('\n')
    assert.equal(lines[0], 'localhost:3000 wants you to sign in with your Ethereum account:')
    assert.equal(lines[1], ADDRESS)
    assert.equal(lines[2], '')
    assert.equal(lines[3], 'Sign in to GuildPass Admin')
    assert.ok(lines.includes('Version: 1'))
    assert.ok(lines.includes('Chain ID: 1'))
    assert.ok(lines.includes('Nonce: abc123'))
    assert.ok(lines.includes('Issued At: 2026-01-01T00:00:00.000Z'))
  })
})
