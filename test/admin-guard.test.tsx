import './setup-env'
import './setup-alias'
import { describe, test, afterEach, after } from 'node:test'
import * as assert from 'node:assert/strict'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Session } from '../lib/api/types'

type AdminGuardModule = typeof import('../components/admin-guard')
type ProvidersModule = typeof import('../lib/wallet/providers')
type WagmiModule = typeof import('wagmi')
type ReactQueryModule = typeof import('@tanstack/react-query')

type MockAuthState = Partial<ReturnType<ProvidersModule['useSiweAuth']>>

const ADDRESS = '0x0000000000000000000000000000000000000abc'
const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString()

let mockAuthState: MockAuthState
let mockSession: Session | undefined

const providers = require('../lib/wallet/providers') as ProvidersModule
const wagmi = require('wagmi') as WagmiModule
const reactQuery = require('@tanstack/react-query') as ReactQueryModule

const originalUseSiweAuth = providers.useSiweAuth
const originalUseAccount = wagmi.useAccount
const originalUseQuery = reactQuery.useQuery

;(providers as unknown as { useSiweAuth: ProvidersModule['useSiweAuth'] }).useSiweAuth = (() => ({
  authSession: null,
  isAuthenticated: false,
  sessionStatus: 'disconnected',
  status: 'disconnected',
  timeLeft: 0,
  isSigningIn: false,
  error: null,
  signIn: async () => {},
  login: async () => {},
  logout: async () => {},
  markExpired: () => {},
  ...mockAuthState,
})) as ProvidersModule['useSiweAuth']

(wagmi as unknown as { useAccount: WagmiModule['useAccount'] }).useAccount = (() => ({
  address: mockAuthState?.sessionStatus === 'disconnected' ? undefined : ADDRESS,
  isConnected: mockAuthState?.sessionStatus !== 'disconnected',
})) as WagmiModule['useAccount']

(reactQuery as unknown as { useQuery: ReactQueryModule['useQuery'] }).useQuery = ((() => ({ data: mockSession })) as unknown) as ReactQueryModule['useQuery']

const { AdminGuard } = require('../components/admin-guard') as AdminGuardModule

afterEach(() => {
  mockAuthState = {}
  mockSession = undefined
})

function authenticatedAuthState(): MockAuthState {
  return {
    authSession: {
      isAuthenticated: true,
      token: 'test-token',
      address: ADDRESS,
      expiresAt: futureExpiry,
    },
    isAuthenticated: true,
    sessionStatus: 'authenticated',
    status: 'authenticated',
    timeLeft: 3600,
  }
}

function renderGuard() {
  return renderToStaticMarkup(
    React.createElement(
      AdminGuard,
      null,
      React.createElement('main', { 'data-testid': 'admin-content' }, 'Admin content'),
    ),
  )
}

describe('AdminGuard layered access checks', () => {
  test('blocks at the wallet layer when no wallet is connected', () => {
    mockAuthState = { sessionStatus: 'disconnected', status: 'disconnected' }

    const html = renderGuard()

    assert.match(html, /Wallet Disconnected/)
    assert.doesNotMatch(html, /SIWE Authentication Required/)
    assert.doesNotMatch(html, /Admin Role Required/)
    assert.doesNotMatch(html, /Admin content/)
  })

  test('blocks at the SIWE layer when a wallet is connected but not authenticated', () => {
    mockAuthState = { sessionStatus: 'connected', status: 'unauthenticated' }

    const html = renderGuard()

    assert.match(html, /SIWE Authentication Required/)
    assert.match(html, /Sign In With Ethereum/)
    assert.doesNotMatch(html, /Wallet Disconnected/)
    assert.doesNotMatch(html, /Admin Role Required/)
    assert.doesNotMatch(html, /Admin content/)
  })

  test('blocks at the role layer for the No Roles mock scenario semantics', () => {
    mockAuthState = authenticatedAuthState()
    mockSession = {
      address: ADDRESS,
      membership: { address: ADDRESS, tier: 'free', active: true },
      roles: [],
      badges: ['New User'],
    }

    const html = renderGuard()

    assert.match(html, /Admin Role Required/)
    assert.doesNotMatch(html, /Wallet Disconnected/)
    assert.doesNotMatch(html, /SIWE Authentication Required/)
    assert.doesNotMatch(html, /Admin content/)
  })

  test('renders children when wallet, SIWE, and admin role checks all pass', () => {
    mockAuthState = authenticatedAuthState()
    mockSession = {
      address: ADDRESS,
      membership: { address: ADDRESS, tier: 'pro', active: true },
      roles: ['admin', 'member'],
      badges: ['Admin', 'Pro Tier'],
    }

    const html = renderGuard()

    assert.match(html, /Admin content/)
    assert.doesNotMatch(html, /Wallet Disconnected/)
    assert.doesNotMatch(html, /SIWE Authentication Required/)
    assert.doesNotMatch(html, /Admin Role Required/)
  })
})

after(() => {
  (providers as unknown as { useSiweAuth: ProvidersModule['useSiweAuth'] }).useSiweAuth = originalUseSiweAuth
  (wagmi as unknown as { useAccount: WagmiModule['useAccount'] }).useAccount = originalUseAccount
  (reactQuery as unknown as { useQuery: ReactQueryModule['useQuery'] }).useQuery = originalUseQuery
})
