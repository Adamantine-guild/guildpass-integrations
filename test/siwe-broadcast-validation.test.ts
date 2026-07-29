import './setup-env'
import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import { isValidBroadcastSession } from '../lib/wallet/siwe-session'

/**
 * Focused unit tests for isValidBroadcastSession() — the guard providers.tsx
 * applies to every session payload received via BroadcastChannel (or the
 * storage-event fallback) before applying it to local state.
 *
 * Bearer mode requires a non-empty token (identical to the inline check this
 * was extracted from). Cookie mode never broadcasts a real token — see
 * providers.tsx's signIn()/performSilentRefresh() scrubbing — so the token
 * check is skipped there, but address/expiresAt are still required in both
 * modes.
 */

const validExpiry = new Date(Date.now() + 60_000).toISOString()

describe('isValidBroadcastSession (#dual-mode-cookie-readiness)', () => {
  test('null/undefined session is always invalid', () => {
    assert.equal(isValidBroadcastSession(null, 'bearer'), false)
    assert.equal(isValidBroadcastSession(undefined, 'bearer'), false)
    assert.equal(isValidBroadcastSession(null, 'cookie'), false)
  })

  test('bearer mode: a well-formed session with a real token is valid', () => {
    assert.equal(
      isValidBroadcastSession({ token: 'jwt-abc', address: '0xabc', expiresAt: validExpiry }, 'bearer'),
      true,
    )
  })

  test('bearer mode: an empty or missing token is rejected', () => {
    assert.equal(
      isValidBroadcastSession({ token: '', address: '0xabc', expiresAt: validExpiry }, 'bearer'),
      false,
    )
    assert.equal(
      isValidBroadcastSession({ token: '   ', address: '0xabc', expiresAt: validExpiry }, 'bearer'),
      false,
    )
    assert.equal(
      isValidBroadcastSession({ address: '0xabc', expiresAt: validExpiry } as any, 'bearer'),
      false,
    )
  })

  test('cookie mode: an empty token is accepted (cookie mode never carries a real one)', () => {
    assert.equal(
      isValidBroadcastSession({ token: '', address: '0xabc', expiresAt: validExpiry }, 'cookie'),
      true,
    )
    assert.equal(
      isValidBroadcastSession({ address: '0xabc', expiresAt: validExpiry } as any, 'cookie'),
      true,
    )
  })

  test('cookie mode: a real, non-empty token is still accepted (dual-ship backend may still send one)', () => {
    assert.equal(
      isValidBroadcastSession({ token: 'jwt-abc', address: '0xabc', expiresAt: validExpiry }, 'cookie'),
      true,
    )
  })

  test('both modes: missing or empty address is always rejected', () => {
    assert.equal(
      isValidBroadcastSession({ token: 'jwt-abc', address: '', expiresAt: validExpiry }, 'bearer'),
      false,
    )
    assert.equal(
      isValidBroadcastSession({ token: '', address: '', expiresAt: validExpiry }, 'cookie'),
      false,
    )
  })

  test('both modes: missing or empty expiresAt is always rejected', () => {
    assert.equal(
      isValidBroadcastSession({ token: 'jwt-abc', address: '0xabc', expiresAt: '' }, 'bearer'),
      false,
    )
    assert.equal(
      isValidBroadcastSession({ token: '', address: '0xabc', expiresAt: '' }, 'cookie'),
      false,
    )
  })
})
