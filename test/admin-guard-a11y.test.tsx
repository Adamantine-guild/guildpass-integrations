import './setup-env'
import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AdminGuard } from '../components/admin-guard'
import { SiweAuthContext } from '../lib/wallet/siwe-context'

type SiweStatus = 'disconnected' | 'unauthenticated' | 'authenticated' | 'expiring'

/**
 * Render AdminGuard inside a real SiweAuthContext provider with a fake value.
 * This drives each guard state without mocking modules — the component reads
 * status/timeLeft/login from context, so supplying the context is enough.
 */
function renderWithAuth(status: SiweStatus, timeLeft: number): string {
  const value = {
    session: null,
    status,
    timeLeft,
    login: async () => {},
    logout: () => {},
  }
  return renderToStaticMarkup(
    React.createElement(
      SiweAuthContext.Provider,
      { value: value as never },
      React.createElement(
        AdminGuard,
        null,
        React.createElement('div', null, 'protected content'),
      ),
    ),
  )
}

describe('AdminGuard accessibility (#125)', () => {
  test('disconnected state announces politely and explains why access is blocked', () => {
    const html = renderWithAuth('disconnected', 0)
    assert.match(html, /role="status"/)
    assert.match(html, /aria-live="polite"/)
    assert.match(html, /aria-label="[^"]*wallet disconnected[^"]*"/i)
    assert.match(html, /no wallet is connected/i)
    assert.doesNotMatch(html, /protected content/)
  })

  test('unauthenticated state labels the sign-in action and explains the state', () => {
    const html = renderWithAuth('unauthenticated', 0)
    assert.match(html, /role="status"/)
    assert.match(html, /aria-live="polite"/)
    assert.match(html, /aria-label="[^"]*sign-in required[^"]*"/i)
    assert.match(html, /aria-label="Sign in with Ethereum[^"]*"/)
    assert.match(html, /connected but not signed in/i)
    assert.doesNotMatch(html, /protected content/)
  })

  test('expired session (timeLeft <= 0) is treated as the sign-in-required state', () => {
    const html = renderWithAuth('authenticated', 0)
    assert.match(html, /aria-label="[^"]*sign-in required[^"]*"/i)
    assert.match(html, /aria-label="Sign in with Ethereum[^"]*"/)
    assert.doesNotMatch(html, /protected content/)
  })

  test('expiring state announces the warning and labels the extend action', () => {
    const html = renderWithAuth('expiring', 45)
    assert.match(html, /role="status"/)
    assert.match(html, /aria-live="polite"/)
    assert.match(html, /aria-label="Extend your signed-in session"/)
    assert.match(html, /aria-hidden="true"/)
    assert.match(html, /protected content/)
  })

  test('authenticated state renders children without a blocking prompt', () => {
    const html = renderWithAuth('authenticated', 600)
    assert.match(html, /protected content/)
    assert.doesNotMatch(html, /Authentication Required/)
    assert.doesNotMatch(html, /Wallet Disconnected/)
  })
})
