import { describe, test, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  hasWebLocks,
  isSessionAlreadyRefreshed,
  markRefreshCompleted,
  refreshLockName,
  waitForPeerRefresh,
  withRefreshLock,
} from '../lib/wallet/refresh-coordination'
import type { SiweAuthSession } from '../lib/api/types'

/**
 * Unit tests for the cross-tab SIWE refresh coordination helper.
 *
 * The repo's test harness has no jsdom, so `navigator` / `window` don't
 * exist by default. We install a minimal fake LockManager and a minimal
 * in-memory localStorage to exercise the Web-Locks path, the no-Locks
 * fallback path, and the peer-refresh marker.
 */

const ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'

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
}

function session(overrides: Partial<SiweAuthSession> = {}): SiweAuthSession {
  return {
    isAuthenticated: true,
    token: 'jwt-abc',
    address: ADDRESS,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    refreshToken: 'refresh-abc',
    refreshExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  ;(globalThis as any).window = { localStorage: new MemoryStorage() }
})

afterEach(() => {
  delete (globalThis as any).navigator
  delete (globalThis as any).window
})

describe('refreshLockName', () => {
  test('is namespaced and lowercases the address', () => {
    assert.equal(
      refreshLockName('0xABCDEF'),
      'guildpass:siwe-refresh:0xabcdef',
    )
  })
})

describe('hasWebLocks / withRefreshLock', () => {
  test('hasWebLocks is false when navigator is undefined', () => {
    assert.equal(hasWebLocks(), false)
  })

  test('hasWebLocks is false when navigator.locks is undefined', () => {
    ;(globalThis as any).navigator = {}
    assert.equal(hasWebLocks(), false)
  })

  test('hasWebLocks is true when navigator.locks is present', () => {
    ;(globalThis as any).navigator = { locks: { request: async () => undefined } }
    assert.equal(hasWebLocks(), true)
  })

  test('withRefreshLock runs fn directly when Web Locks is unavailable', async () => {
    let ran = false
    const result = await withRefreshLock(ADDRESS, async () => {
      ran = true
      return 'done'
    })
    assert.equal(ran, true)
    assert.equal(result, 'done')
  })

  test('withRefreshLock requests the per-address lock when Web Locks is available', async () => {
    const requested: string[] = []
    ;(globalThis as any).navigator = {
      locks: {
        request: async (name: string, fn: () => Promise<unknown>) => {
          requested.push(name)
          return fn()
        },
      },
    }

    let ran = false
    const result = await withRefreshLock(ADDRESS, async () => {
      ran = true
      return 'done'
    })

    assert.equal(ran, true)
    assert.equal(result, 'done')
    assert.deepEqual(requested, [refreshLockName(ADDRESS)])
  })

  test('withRefreshLock serializes two concurrent callers via the fake lock manager', async () => {
    // Simulate the browser's own serialization: a single in-flight holder,
    // second request queues behind it.
    let holder: Promise<unknown> | null = null
    ;(globalThis as any).navigator = {
      locks: {
        request: async (_name: string, fn: () => Promise<unknown>) => {
          const previous = holder ?? Promise.resolve()
          const run = previous.then(fn)
          holder = run.catch(() => undefined)
          return run
        },
      },
    }

    const order: string[] = []
    const first = withRefreshLock(ADDRESS, async () => {
      order.push('first-start')
      await new Promise((resolve) => setTimeout(resolve, 10))
      order.push('first-end')
      return 'first'
    })
    const second = withRefreshLock(ADDRESS, async () => {
      order.push('second-start')
      order.push('second-end')
      return 'second'
    })

    const [firstResult, secondResult] = await Promise.all([first, second])
    assert.equal(firstResult, 'first')
    assert.equal(secondResult, 'second')
    assert.deepEqual(order, ['first-start', 'first-end', 'second-start', 'second-end'])
  })
})

describe('isSessionAlreadyRefreshed', () => {
  test('false when nothing is stored yet', () => {
    assert.equal(isSessionAlreadyRefreshed(null, session()), false)
  })

  test('false when the stored session is identical to the snapshot (no peer refresh happened)', () => {
    const snapshot = session()
    assert.equal(isSessionAlreadyRefreshed(snapshot, snapshot), false)
  })

  test('true when a peer tab already rotated the token and the result is still valid', () => {
    const snapshot = session()
    const rotated = session({
      token: 'jwt-new',
      refreshToken: 'refresh-new',
      expiresAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    })
    assert.equal(isSessionAlreadyRefreshed(rotated, snapshot), true)
  })

  test('false when the stored session is for a different address', () => {
    const snapshot = session()
    const other = session({
      address: '0x9999999999999999999999999999999999999999',
      refreshToken: 'refresh-new',
      expiresAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    })
    assert.equal(isSessionAlreadyRefreshed(other, snapshot), false)
  })

  test('false when the "rotated" session is itself already expired', () => {
    const snapshot = session()
    const staleRotation = session({
      refreshToken: 'refresh-new',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    })
    assert.equal(isSessionAlreadyRefreshed(staleRotation, snapshot), false)
  })

  test('address comparison is case-insensitive', () => {
    const snapshot = session({ address: ADDRESS.toLowerCase() })
    const rotated = session({
      address: ADDRESS.toUpperCase(),
      refreshToken: 'refresh-new',
      expiresAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    })
    assert.equal(isSessionAlreadyRefreshed(rotated, snapshot), true)
  })
})

describe('waitForPeerRefresh', () => {
  test('resolves immediately with null when no marker has been written, without requesting a rebroadcast', async () => {
    const snapshot = session()
    let requested = false
    const start = Date.now()
    const result = await waitForPeerRefresh(
      ADDRESS,
      snapshot,
      () => null,
      () => {
        requested = true
      },
      { timeoutMs: 500, pollIntervalMs: 10 },
    )
    assert.equal(result, null)
    assert.equal(requested, false)
    // No marker evidence of a peer refresh — must not wait at all.
    assert.ok(Date.now() - start < 100)
  })

  test('resolves immediately with null when the marker is not newer than the snapshot', async () => {
    const snapshot = session()
    markRefreshCompleted(ADDRESS, snapshot.expiresAt)
    let requested = false
    const start = Date.now()
    const result = await waitForPeerRefresh(
      ADDRESS,
      snapshot,
      () => null,
      () => {
        requested = true
      },
      { timeoutMs: 500, pollIntervalMs: 10 },
    )
    assert.equal(result, null)
    assert.equal(requested, false)
    assert.ok(Date.now() - start < 100)
  })

  test('requests a rebroadcast and picks up a peer refresh that lands after a short delay', async () => {
    const snapshot = session()
    const rotated = session({
      token: 'jwt-new',
      refreshToken: 'refresh-new',
      expiresAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    })
    markRefreshCompleted(ADDRESS, rotated.expiresAt)

    let requested = false
    let attempts = 0
    const loadCurrent = () => {
      attempts += 1
      // Simulate a peer's 'refreshed' response (triggered by our request)
      // landing a couple of polls later.
      return attempts >= 3 ? rotated : null
    }

    const result = await waitForPeerRefresh(
      ADDRESS,
      snapshot,
      loadCurrent,
      () => {
        requested = true
      },
      { timeoutMs: 1000, pollIntervalMs: 5 },
    )
    assert.equal(requested, true)
    assert.deepEqual(result, rotated)
  })

  test('times out and returns null if no peer ever responds', async () => {
    const snapshot = session()
    const rotated = session({
      refreshToken: 'refresh-new',
      expiresAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    })
    markRefreshCompleted(ADDRESS, rotated.expiresAt)

    const result = await waitForPeerRefresh(
      ADDRESS,
      snapshot,
      () => null,
      () => {},
      { timeoutMs: 100, pollIntervalMs: 10 },
    )
    assert.equal(result, null)
  })
})
