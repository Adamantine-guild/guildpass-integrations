import './setup-env'
import { describe, test, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'

/**
 * Focused unit tests for lib/api/mock.ts's cookie-auth-mode session
 * simulation (dual-mode readiness — see docs/http-only-cookie-migration.md).
 *
 * Proves:
 *   - getSessionStatus()/siweVerify()/siweRefresh()/siweLogout() never read
 *     or write sessionStorage — only the simulated document.cookie jar —
 *     so cookie-mode mock session state is deterministic and independent of
 *     the bearer-token sessionStorage path.
 *   - The cookie "survives reload" (a fresh MockAccessApi instance still
 *     sees it, since document.cookie is not per-instance state) but does not
 *     leak into bearer mode (no cookie writes happen there at all).
 */

let sessionStorageCalls = 0

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

/** A window whose sessionStorage spies on every call — mock.ts must never touch it. */
function installSpySessionStorageWindow(): void {
  sessionStorageCalls = 0
  const store = new Map<string, string>()
  ;(globalThis as any).window = {
    sessionStorage: {
      getItem: (k: string) => {
        sessionStorageCalls += 1
        return store.has(k) ? store.get(k)! : null
      },
      setItem: (k: string, v: string) => {
        sessionStorageCalls += 1
        store.set(k, v)
      },
      removeItem: (k: string) => {
        sessionStorageCalls += 1
        store.delete(k)
      },
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
}

function uninstallFakes(): void {
  delete (globalThis as any).document
  delete (globalThis as any).window
}

function loadMockApi(authMode: 'bearer' | 'cookie'): typeof import('../lib/api/mock') {
  process.env.NEXT_PUBLIC_AUTH_MODE = authMode
  process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
  delete require.cache[require.resolve('../lib/config')]
  delete require.cache[require.resolve('../lib/api/mock')]
  return require('../lib/api/mock')
}

const ADDRESS = '0x1234567890123456789012345678901234567890'

async function signIn(mock: typeof import('../lib/api/mock'), address = ADDRESS) {
  const api = new mock.MockAccessApi(address)
  const nonce = await api.getNonce(address)
  const message = `localhost:3000 wants you to sign in with your Ethereum account:\n${address}\n\nSign in to GuildPass Admin\n\nURI: https://localhost:3000\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`
  await api.siweVerify(message, 'mock-signature')
  return api
}

beforeEach(() => {
  installFakeDocument()
  installSpySessionStorageWindow()
})

afterEach(() => {
  uninstallFakes()
  delete process.env.NEXT_PUBLIC_AUTH_MODE
  delete process.env.NEXT_PUBLIC_MOCK_MODE
})

describe('MockAccessApi cookie-session simulation (#dual-mode-cookie-readiness)', () => {
  test('cookie mode: getSessionStatus() is false before sign-in', async () => {
    const mock = loadMockApi('cookie')
    const api = new mock.MockAccessApi(ADDRESS)
    const status = await api.getSessionStatus()
    assert.deepEqual(status, { authenticated: false })
  })

  test('cookie mode: siweVerify() sets the mock cookie; getSessionStatus() then reports authenticated:true', async () => {
    const mock = loadMockApi('cookie')
    await signIn(mock)

    const freshApi = new mock.MockAccessApi(ADDRESS)
    const status = await freshApi.getSessionStatus()
    assert.equal(status.authenticated, true)
    assert.equal(status.address, ADDRESS)
    assert.ok(status.expiresAt)
  })

  test('cookie mode: the mock cookie survives a fresh MockAccessApi instance ("reload")', async () => {
    const mock = loadMockApi('cookie')
    await signIn(mock)

    // A brand-new instance (simulating a page reload, where a fresh API
    // client is constructed) still sees the same cookie jar.
    const reloaded = new mock.MockAccessApi(ADDRESS)
    assert.equal((await reloaded.getSessionStatus()).authenticated, true)
  })

  test('cookie mode: siweLogout() clears the mock cookie', async () => {
    const mock = loadMockApi('cookie')
    const api = await signIn(mock)
    assert.equal((await api.getSessionStatus()).authenticated, true)

    await api.siweLogout()
    assert.deepEqual(await api.getSessionStatus(), { authenticated: false })
  })

  test('cookie mode: siweRefresh() rotates the cookie and keeps getSessionStatus() true', async () => {
    const mock = loadMockApi('cookie')
    const api = await signIn(mock)

    // Cookie mode has no refresh-token string to pass; the mock validates
    // against the cookie itself instead.
    await api.siweRefresh('')
    assert.equal((await api.getSessionStatus()).authenticated, true)
  })

  test('cookie mode: siweRefresh() fails once the cookie has been cleared', async () => {
    const mock = loadMockApi('cookie')
    const api = await signIn(mock)
    await api.siweLogout()

    await assert.rejects(() => api.siweRefresh(''))
  })

  test('cookie-mode session simulation never reads or writes sessionStorage', async () => {
    const mock = loadMockApi('cookie')
    const api = await signIn(mock)
    await api.getSessionStatus()
    await api.siweRefresh('')
    await api.siweLogout()
    assert.equal(sessionStorageCalls, 0)
  })

  test('bearer mode: siweVerify()/siweLogout() never touch document.cookie', async () => {
    const mock = loadMockApi('bearer')
    const api = await signIn(mock)
    // getSessionStatus() itself is mode-agnostic at the type level, but
    // bearer-mode sign-in/logout must never have written the mock cookie.
    assert.equal((globalThis as any).document.cookie, '')
    await api.siweLogout()
    assert.equal((globalThis as any).document.cookie, '')
  })
})
