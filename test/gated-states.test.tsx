import './setup-env'
import './setup-alias'
import { describe, test, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ApiError } from '../lib/api/errors'

type GatedModule = typeof import('../components/gated')
type WagmiModule = typeof import('wagmi')
type ReactQueryModule = typeof import('@tanstack/react-query')

interface MockQueryState {
  data?: unknown
  isLoading?: boolean
  isError?: boolean
  error?: unknown
  isFetching?: boolean
}

const ADDRESS = '0x1234567890123456789012345678901234567890'

let sessionState: MockQueryState = {}
let policiesState: MockQueryState = {}
let resourcesState: MockQueryState = {}
let decisionState: MockQueryState = {}

const wagmiPath = require.resolve('wagmi')
const reactQueryPath = require.resolve('@tanstack/react-query')

const mockWagmi: Partial<WagmiModule> = {
  useAccount: () =>
    ({ address: ADDRESS, chain: { id: 1 }, isConnected: true } as unknown as ReturnType<WagmiModule['useAccount']>),
}

const defaultResult = {
  data: undefined,
  isLoading: false,
  isError: false,
  error: null,
  isFetching: false,
  refetch: () => {},
}

const mockReactQuery: Partial<ReactQueryModule> = {
  useQuery: ((opts: { queryKey: readonly unknown[] }) => {
    const key = opts.queryKey[0]
    if (key === 'session') return { ...defaultResult, ...sessionState }
    if (key === 'policies') return { ...defaultResult, ...policiesState }
    if (key === 'resources') return { ...defaultResult, ...resourcesState }
    if (key === 'access') return { ...defaultResult, ...decisionState }
    return { ...defaultResult }
  }) as ReactQueryModule['useQuery'],
}

require.cache[wagmiPath] = { id: wagmiPath, loaded: true, exports: mockWagmi } as any
require.cache[reactQueryPath] = { id: reactQueryPath, loaded: true, exports: mockReactQuery } as any

const { Gated } = require('../components/gated') as GatedModule

function renderGated() {
  return renderToStaticMarkup(
    React.createElement(Gated, {
      resourceId: 'alpha',
      children: React.createElement('div', null, 'Gated content'),
    }),
  )
}

afterEach(() => {
  sessionState = {}
  policiesState = {}
  resourcesState = {}
  decisionState = {}
})

describe('Gated states', () => {
  test('session operational error renders ErrorState, never AccessDenied', () => {
    sessionState = {
      isError: true,
      error: new ApiError({
        code: 'network_error',
        safeMessage: 'Unable to connect. Please check your connection and try again.',
        retryable: true,
      }),
    }

    const html = renderGated()

    assert.match(html, /Could not verify access/)
    assert.doesNotMatch(html, /Access denied/)
    assert.doesNotMatch(html, /Gated content/)
  })

  test('retrying the session error disables the button and relabels it', () => {
    sessionState = {
      isError: true,
      error: new ApiError({ code: 'network_error', safeMessage: 'Unable to connect.', retryable: true }),
      isFetching: true,
    }

    const html = renderGated()

    assert.match(html, /Retrying…/)
    assert.match(html, /disabled=""/)
  })

  test('policies/resources fallback query error (previously silent) surfaces its own operational error', () => {
    sessionState = { data: { address: ADDRESS, roles: ['member'], membership: { address: ADDRESS, tier: 'free', active: true } } }
    policiesState = {
      isError: true,
      error: new ApiError({ status: 500, code: 'server_error', safeMessage: 'The server could not complete the request. Please try again.', retryable: true }),
    }
    resourcesState = {}

    const html = renderGated()

    assert.match(html, /Could not load access requirements/)
    assert.doesNotMatch(html, /Access denied/)
    assert.doesNotMatch(html, /Gated content/)
  })

  test('legitimate access denial (e.g. insufficient tier) renders AccessDenied, not the operational error UI', () => {
    sessionState = { data: { address: ADDRESS, roles: ['member'], membership: { address: ADDRESS, tier: 'free', active: true } } }
    decisionState = {
      data: {
        allowed: false,
        reason: 'This resource requires the Standard tier or higher. You\'re currently on the Free tier.',
        checkedAt: new Date().toISOString(),
      },
    }

    const html = renderGated()

    assert.match(html, /Access denied/)
    assert.match(html, /Standard tier or higher/)
    assert.doesNotMatch(html, /Could not verify access/)
    assert.doesNotMatch(html, /Could not load access requirements/)
    assert.doesNotMatch(html, /Gated content/)
  })

  test('expired/inactive membership denial is not classified as a network error', () => {
    sessionState = {
      data: { address: ADDRESS, roles: ['member'], membership: { address: ADDRESS, tier: 'standard', active: false } },
    }
    decisionState = {
      data: {
        allowed: false,
        reason: 'Your membership has expired or is inactive. Renew to regain access.',
        checkedAt: new Date().toISOString(),
      },
    }

    const html = renderGated()

    assert.match(html, /Access denied/)
    assert.match(html, /expired or is inactive/)
    assert.doesNotMatch(html, /Could not verify access/)
    assert.doesNotMatch(html, /network/i)
  })

  test('allowed decision with no errors renders the gated children', () => {
    sessionState = { data: { address: ADDRESS, roles: ['member'], membership: { address: ADDRESS, tier: 'pro', active: true } } }
    decisionState = { data: { allowed: true, reason: 'Access granted.', checkedAt: new Date().toISOString() } }

    const html = renderGated()

    assert.match(html, /Gated content/)
    assert.doesNotMatch(html, /Access denied/)
    assert.doesNotMatch(html, /Could not verify access/)
    assert.doesNotMatch(html, /Could not load access requirements/)
  })
})
