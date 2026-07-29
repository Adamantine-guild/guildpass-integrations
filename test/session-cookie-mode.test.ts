import './setup-env'
import { describe, test, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'

/**
 * Focused unit tests proving lib/session.ts's cookie-auth-mode invariants
 * (dual-mode readiness — see docs/http-only-cookie-migration.md):
 *
 *   - storeAuthSession/loadAuthSession/loadAuthSessionIncludingExpired/
 *     getStoredToken/getStoredAddress/clearAuthSession never call
 *     sessionStorage.{setItem,getItem,removeItem} when config.authMode is
 *     'cookie' — proven by call-count spies, not just return-value checks.
 *   - bearer mode (the default) is completely unaffected.
 *   - isSessionActive() reflects the approved session-status endpoint.
 *
 * lib/session.ts reads `config.authMode` from the frozen `lib/config.ts`
 * singleton, so each authMode variant requires setting
 * NEXT_PUBLIC_AUTH_MODE *before* a fresh require() of both modules (a fresh
 * `lib/config` instance is required too — unlike test/wallet-config.test.ts,
 * nothing here depends on `instanceof` identity across module instances).
 */

let dispatched: string[] = []
let sessionStorageCalls: { setItem: number; getItem: number; removeItem: number } = {
  setItem: 0,
  getItem: 0,
  removeItem: 0,
}

class SpyStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    sessionStorageCalls.getItem += 1
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string): void {
    sessionStorageCalls.setItem += 1
    this.store.set(key, String(value))
  }
  removeItem(key: string): void {
    sessionStorageCalls.removeItem += 1
    this.store.delete(key)
  }
}

function installFakeWindow(): void {
  dispatched = []
  sessionStorageCalls = { setItem: 0, getItem: 0, removeItem: 0 }
  ;(globalThis as any).window = {
    sessionStorage: new SpyStorage(),
    dispatchEvent: (event: { type: string }) => {
      dispatched.push(event.type)
      return true
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  ;(globalThis as any).CustomEvent = class {
    type: string
    constructor(type: string) {
      this.type = type
    }
  }
}

function uninstallFakeWindow(): void {
  delete (globalThis as any).window
  delete (globalThis as any).CustomEvent
}

/** Minimal document.cookie jar shim so the mock API's cookie simulation works under node:test (no jsdom). */
function installFakeDocument(): void {
  const jar = new Map<string, string>()
  ;(globalThis as any).document = {
    get cookie(): string {
      return Array.from(jar.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ')
    },
    set cookie(raw: string) {
      const [pair, ...attrs] = raw.split('; ')
      const eq = pair.indexOf('=')
      const name = pair.slice(0, eq)
      const value = pair.slice(eq + 1)
      const maxAge = attrs.find((a) => a.toLowerCase().startsWith('max-age='))
      if (maxAge && Number(maxAge.split('=')[1]) <= 0) {
        jar.delete(name)
      } else {
        jar.set(name, value)
      }
    },
  }
}

function uninstallFakeDocument(): void {
  delete (globalThis as any).document
}

function loadSessionModule(authMode: 'bearer' | 'cookie' | undefined): typeof import('../lib/session') {
  if (authMode === undefined) {
    delete process.env.NEXT_PUBLIC_AUTH_MODE
  } else {
    process.env.NEXT_PUBLIC_AUTH_MODE = authMode
  }
  delete require.cache[require.resolve('../lib/config')]
  delete require.cache[require.resolve('../lib/session')]
  delete require.cache[require.resolve('../lib/api')]
  delete require.cache[require.resolve('../lib/api/mock')]
  delete require.cache[require.resolve('../lib/api/live')]
  return require('../lib/session')
}

beforeEach(() => {
  installFakeWindow()
  installFakeDocument()
})

afterEach(() => {
  uninstallFakeWindow()
  uninstallFakeDocument()
  delete process.env.NEXT_PUBLIC_AUTH_MODE
})

describe('lib/session.ts cookie auth mode (#dual-mode-cookie-readiness)', () => {
  test('cookie mode: storeAuthSession never calls sessionStorage.setItem', () => {
    const { storeAuthSession } = loadSessionModule('cookie')
    storeAuthSession({
      isAuthenticated: true,
      token: 'real-bearer-token',
      address: '0xabc',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    } as any)
    assert.equal(sessionStorageCalls.setItem, 0)
  })

  test('cookie mode: loadAuthSession/loadAuthSessionIncludingExpired never call sessionStorage.getItem and return null', () => {
    const { loadAuthSession, loadAuthSessionIncludingExpired } = loadSessionModule('cookie')
    assert.equal(loadAuthSession(), null)
    assert.equal(loadAuthSessionIncludingExpired(), null)
    assert.equal(sessionStorageCalls.getItem, 0)
  })

  test('cookie mode: getStoredToken/getStoredAddress never touch sessionStorage', () => {
    const { getStoredToken, getStoredAddress } = loadSessionModule('cookie')
    assert.equal(getStoredToken(), null)
    assert.equal(getStoredAddress(), null)
    assert.equal(sessionStorageCalls.getItem, 0)
  })

  test('cookie mode: clearAuthSession never calls sessionStorage.removeItem, but still dispatches siwe:invalidated', () => {
    const { clearAuthSession } = loadSessionModule('cookie')
    clearAuthSession()
    assert.equal(sessionStorageCalls.removeItem, 0)
    assert.ok(dispatched.includes('siwe:invalidated'))
  })

  test('cookie mode: a full store→load→clear sequence never calls any sessionStorage method', () => {
    const { storeAuthSession, loadAuthSession, clearAuthSession } = loadSessionModule('cookie')
    storeAuthSession({
      isAuthenticated: true,
      token: 'real-bearer-token',
      address: '0xabc',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    } as any)
    loadAuthSession()
    clearAuthSession()
    assert.deepEqual(sessionStorageCalls, { setItem: 0, getItem: 0, removeItem: 0 })
  })

  test('bearer mode (default, unset env var): sessionStorage round-trip still works exactly as before', () => {
    const { storeAuthSession, loadAuthSession } = loadSessionModule(undefined)
    const session = {
      isAuthenticated: true,
      token: 'jwt-abc-123',
      address: '0xabc',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }
    storeAuthSession(session as any)
    assert.deepEqual(loadAuthSession(), session)
    assert.equal(sessionStorageCalls.setItem, 1)
    assert.equal(sessionStorageCalls.getItem > 0, true)
  })

  test('bearer mode (explicit "bearer"): behaves identically to unset', () => {
    const { storeAuthSession, loadAuthSession } = loadSessionModule('bearer')
    const session = {
      isAuthenticated: true,
      token: 'jwt-xyz',
      address: '0xdef',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }
    storeAuthSession(session as any)
    assert.deepEqual(loadAuthSession(), session)
  })

  test('isSessionActive() reflects false before sign-in, true after a mock cookie sign-in, false after logout', async () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
    const { isSessionActive } = loadSessionModule('cookie')
    const { MockAccessApi } = require('../lib/api/mock')

    assert.equal(await isSessionActive(), false)

    const api = new MockAccessApi('0x1234567890123456789012345678901234567890')
    const nonce = await api.getNonce('0x1234567890123456789012345678901234567890')
    const message = `localhost:3000 wants you to sign in with your Ethereum account:\n0x1234567890123456789012345678901234567890\n\nSign in to GuildPass Admin\n\nURI: https://localhost:3000\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`
    await api.siweVerify(message, 'mock-signature')

    assert.equal(await isSessionActive(), true)

    await api.siweLogout()
    assert.equal(await isSessionActive(), false)

    delete process.env.NEXT_PUBLIC_MOCK_MODE
  })
})
