import './setup-env'
import { describe, test, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  storeAuthSession,
  loadAuthSession,
  clearAuthSession,
  invalidateAuthSession,
} from '../lib/session'
import type { SiweAuthSession } from '../lib/api/types'

/**
 * Unit tests for the sessionStorage-backed SIWE session helpers (#117).
 *
 * The repo's test harness has no jsdom, so `window` / `sessionStorage` don't
 * exist. We install a minimal in-memory sessionStorage plus a CustomEvent /
 * dispatchEvent shim on a fake `window`, exercise the helpers, and assert the
 * success, clear/logout, and corrupted-data paths (plus expiry and SSR guards).
 */

const SESSION_KEY = 'guildpass:siwe-session'

/** Minimal in-memory Storage matching the subset the helpers use. */
class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  clear(): void {
    this.store.clear()
  }
}

/** A valid, unexpired session fixture. */
function validSession(overrides: Partial<SiweAuthSession> = {}): SiweAuthSession {
  return {
    isAuthenticated: true,
    token: 'jwt-abc-123',
    address: '0xabc',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ...overrides,
  } as SiweAuthSession
}

let dispatched: string[] = []

beforeEach(() => {
  dispatched = []
  const storage = new MemoryStorage()
  ;(globalThis as any).window = {
    sessionStorage: storage,
    dispatchEvent: (event: { type: string }) => {
      dispatched.push(event.type)
      return true
    },
  }
  ;(globalThis as any).CustomEvent = class {
    type: string
    constructor(type: string) {
      this.type = type
    }
  }
})

afterEach(() => {
  delete (globalThis as any).window
  delete (globalThis as any).CustomEvent
})

describe('session storage helpers (#117)', () => {
  // ── Success path ─────────────────────────────────────────────────────────

  test('store then load round-trips the session', () => {
    const session = validSession()
    storeAuthSession(session)

    const loaded = loadAuthSession()
    assert.deepEqual(loaded, session)
  })

  test('store writes JSON under the expected key', () => {
    const session = validSession()
    storeAuthSession(session)

    const raw = (globalThis as any).window.sessionStorage.getItem(SESSION_KEY)
    assert.equal(typeof raw, 'string')
    assert.deepEqual(JSON.parse(raw), session)
  })

  // ── Clear / logout path ──────────────────────────────────────────────────

  test('clear removes the stored session so load returns null', () => {
    storeAuthSession(validSession())
    clearAuthSession()

    assert.equal(loadAuthSession(), null)
  })

  test('clear dispatches a siwe:invalidated event', () => {
    storeAuthSession(validSession())
    clearAuthSession()

    assert.ok(dispatched.includes('siwe:invalidated'))
  })

  test('invalidateAuthSession clears the session', () => {
    storeAuthSession(validSession())
    invalidateAuthSession()

    assert.equal(loadAuthSession(), null)
  })

  // ── Corrupted / missing data path ────────────────────────────────────────

  test('load returns null when nothing is stored', () => {
    assert.equal(loadAuthSession(), null)
  })

  test('load returns null (no throw) on malformed JSON', () => {
    ;(globalThis as any).window.sessionStorage.setItem(SESSION_KEY, '{not valid json')

    assert.doesNotThrow(() => loadAuthSession())
    assert.equal(loadAuthSession(), null)
  })

  test('load returns null when required fields are missing', () => {
    ;(globalThis as any).window.sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ token: 'only-a-token' }),
    )

    assert.equal(loadAuthSession(), null)
  })

  // ── Expiry guard ─────────────────────────────────────────────────────────

  test('load returns null for an expired session but does not clear it', () => {
    const expired = validSession({
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    })
    storeAuthSession(expired)

    assert.equal(loadAuthSession(), null)
    // Expired load should not clear the entry because the refresh token might be valid.
    assert.notEqual(
      (globalThis as any).window.sessionStorage.getItem(SESSION_KEY),
      null,
    )
  })

  // ── SSR guards ───────────────────────────────────────────────────────────

  test('helpers are safe no-ops when window is undefined', () => {
    delete (globalThis as any).window

    assert.doesNotThrow(() => storeAuthSession(validSession()))
    assert.equal(loadAuthSession(), null)
    assert.doesNotThrow(() => clearAuthSession())
  })
})