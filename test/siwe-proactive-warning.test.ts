import './setup-env'
import './setup-alias'
import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getRemainingSessionSeconds,
  isSessionExpiringSoon,
  formatTimeRemaining,
} from '../lib/session'

const wagmiPath = require.resolve('wagmi')
const originalWagmi = require(wagmiPath)
require.cache[wagmiPath]!.exports = {
  ...originalWagmi,
  useAccount: () => ({
    address: '0x123',
    isConnected: true,
  }),
}

const reactQueryPath = require.resolve('@tanstack/react-query')
const originalReactQuery = require(reactQueryPath)
require.cache[reactQueryPath]!.exports = {
  ...originalReactQuery,
  useQuery: () => ({
    data: {
      address: '0x123',
      membership: { address: '0x123', tier: 'pro', active: true },
      roles: ['admin', 'member'],
      badges: ['Admin'],
    },
  }),
}

const { AdminGuard } = require('../components/admin-guard')
const { SiweAuthContext } = require('../lib/wallet/siwe-context')

describe('Proactive Session Expiry Warning Helpers (lib/session.ts)', () => {
  test('getRemainingSessionSeconds computes seconds correctly', () => {
    const futureMs = Date.now() + 90 * 1000
    const session = { expiresAt: new Date(futureMs).toISOString() }
    const remaining = getRemainingSessionSeconds(session)
    assert.ok(remaining >= 89 && remaining <= 91)

    const pastSession = { expiresAt: new Date(Date.now() - 10000).toISOString() }
    assert.equal(getRemainingSessionSeconds(pastSession), 0)
    assert.equal(getRemainingSessionSeconds(null), 0)
  })

  test('isSessionExpiringSoon detects sessions within configurable threshold', () => {
    const sessionIn100s = { expiresAt: new Date(Date.now() + 100 * 1000).toISOString() }
    const sessionIn300s = { expiresAt: new Date(Date.now() + 300 * 1000).toISOString() }
    const expiredSession = { expiresAt: new Date(Date.now() - 1000).toISOString() }

    // Default threshold is 120s (2 minutes)
    assert.equal(isSessionExpiringSoon(sessionIn100s, 120), true)
    assert.equal(isSessionExpiringSoon(sessionIn300s, 120), false)
    assert.equal(isSessionExpiringSoon(expiredSession, 120), false)

    // Custom threshold of 360s (6 minutes)
    assert.equal(isSessionExpiringSoon(sessionIn300s, 360), true)
  })

  test('formatTimeRemaining formats seconds into human readable duration', () => {
    assert.equal(formatTimeRemaining(105), '1m 45s')
    assert.equal(formatTimeRemaining(45), '45s')
    assert.equal(formatTimeRemaining(0), '0s')
    assert.equal(formatTimeRemaining(-10), '0s')
  })
})

describe('AdminGuard Proactive Session Warning Component (#226)', () => {
  function renderAdminGuard(overrides: Record<string, unknown> = {}) {
    const value = {
      sessionStatus: 'authenticated',
      status: 'authenticated',
      authSession: {
        token: 'test-token',
        address: '0x123',
        expiresAt: new Date(Date.now() + 100 * 1000).toISOString(),
      },
      timeLeft: 100,
      isExpiring: true,
      warningThresholdSeconds: 120,
      signIn: async () => {},
      login: async () => {},
      logout: () => {},
      ...overrides,
    }

    return renderToStaticMarkup(
      React.createElement(
        SiweAuthContext.Provider,
        { value: value as never },
        React.createElement(
          AdminGuard,
          null,
          React.createElement('div', { 'data-testid': 'protected' }, 'Protected Admin View'),
        ),
      ),
    )
  }

  test('renders proactive warning banner when session is within threshold', () => {
    const html = renderAdminGuard({ status: 'expiring', timeLeft: 90, warningThresholdSeconds: 120 })
    assert.match(html, /Your security session will expire in/i)
    assert.match(html, /90s/)
    assert.match(html, /aria-label="Extend your signed-in session"/)
    assert.match(html, /Extend Session/)
    assert.match(html, /Dismiss/)
  })

  test('does not render warning banner when session is well outside threshold', () => {
    const html = renderAdminGuard({ status: 'authenticated', timeLeft: 600, warningThresholdSeconds: 120 })
    assert.doesNotMatch(html, /Your security session will expire in/i)
    assert.match(html, /Protected Admin View/)
  })

  test('does not render warning for unauthenticated or disconnected states', () => {
    const htmlUnauth = renderAdminGuard({ sessionStatus: 'unauthenticated', status: 'unauthenticated', timeLeft: 0 })
    assert.doesNotMatch(htmlUnauth, /Your security session will expire in/i)
    assert.match(htmlUnauth, /SIWE Authentication Required/i)

    const htmlDisconn = renderAdminGuard({ sessionStatus: 'disconnected', status: 'disconnected', timeLeft: 0 })
    assert.doesNotMatch(htmlDisconn, /Your security session will expire in/i)
    assert.match(htmlDisconn, /Wallet Disconnected/i)
  })
})
