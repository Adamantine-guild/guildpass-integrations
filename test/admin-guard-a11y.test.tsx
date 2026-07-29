import './setup-env'
import './setup-alias'
import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AdminGuard, SiwePrompt } from '../components/admin-guard'
import { SiweAuthContext } from '../lib/wallet/siwe-context'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const config = createConfig({
  chains: [mainnet],
  transports: {
    [mainnet.id]: http(),
  },
})
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      initialData: { roles: ['admin'] },
    },
  },
})

type SiweStatus = 'disconnected' | 'unauthenticated' | 'authenticated' | 'expiring'

/**
 * Render AdminGuard inside a real SiweAuthContext provider with a fake value.
 * This drives each guard state without mocking modules — the component reads
 * status/timeLeft/login from context, so supplying the context is enough.
 */
function renderWithAuth(status: SiweStatus, timeLeft: number): string {
  const sessionStatus = status === 'expiring' ? 'authenticated' : (status === 'authenticated' && timeLeft <= 0 ? 'expired' : status)
  const value = {
    session: null,
    status,
    sessionStatus,
    timeLeft,
    login: async () => {},
    logout: () => {},
    signIn: async () => {},
    isSigningIn: false,
  }
  return renderToStaticMarkup(
    React.createElement(
      WagmiProvider,
      { config },
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(
          SiweAuthContext.Provider,
          { value: value as never },
          React.createElement(
            AdminGuard,
            null,
            React.createElement('div', null, 'protected content'),
          ),
        ),
      ),
    ),
  )
}

describe('AdminGuard accessibility (#125, #330)', () => {
  test('disconnected state announces politely and explains why access is blocked', () => {
    const html = renderWithAuth('disconnected', 0)
    assert.match(html, /role="status"/)
    assert.match(html, /aria-live="polite"/)
    assert.match(html, /aria-label="[^"]*wallet disconnected[^"]*"/i)
    assert.match(html, /no wallet is connected/i)
    assert.doesNotMatch(html, /protected content/)
  })

  test('unauthenticated state renders SiwePrompt dialog with ARIA accessibility attributes', () => {
    const html = renderWithAuth('unauthenticated', 0)
    assert.match(html, /role="dialog"/)
    assert.match(html, /aria-modal="true"/)
    assert.match(html, /aria-labelledby="siwe-prompt-title"/)
    assert.match(html, /aria-describedby="siwe-prompt-description"/)
    assert.match(html, /id="siwe-prompt-title"/)
    assert.match(html, /id="siwe-prompt-description"/)
    assert.match(html, /aria-label="Sign in with Ethereum[^"]*"/)
    assert.match(html, /connected but not signed in/i)
    assert.doesNotMatch(html, /protected content/)
  })

  test('expired session (timeLeft <= 0) is treated as the sign-in-required dialog state', () => {
    const html = renderWithAuth('authenticated', 0)
    assert.match(html, /role="dialog"/)
    assert.match(html, /aria-modal="true"/)
    assert.match(html, /aria-labelledby="siwe-prompt-title"/)
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

  test('SiwePrompt direct component rendering and props', () => {
    let closed = false
    const promptHtml = renderToStaticMarkup(
      React.createElement(SiwePrompt, {
        sessionStatus: 'unauthenticated',
        isSigningIn: false,
        onClose: () => {
          closed = true
        },
      }),
    )
    assert.match(promptHtml, /role="dialog"/)
    assert.match(promptHtml, /aria-modal="true"/)
    assert.match(promptHtml, /id="siwe-prompt-title"/)
    assert.match(promptHtml, /id="siwe-prompt-description"/)
    assert.equal(closed, false)
  })
})

