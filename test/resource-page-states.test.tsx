import './setup-env'
import './setup-alias'
import { describe, test, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ApiError } from '../lib/api/errors'

type PageModule = typeof import('../app/[communitySlug]/resources/[resourceId]/page')
type WagmiModule = typeof import('wagmi')
type ReactQueryModule = typeof import('@tanstack/react-query')

const ADDRESS = '0x1234567890123456789012345678901234567890'

interface MockQueryState {
  data?: unknown
  isLoading?: boolean
  isError?: boolean
  error?: unknown
  isFetching?: boolean
}

let resourceQueryState: MockQueryState = {}
let policyQueryState: MockQueryState = {}

const wagmiPath = require.resolve('wagmi')
const reactQueryPath = require.resolve('@tanstack/react-query')
const navigationPath = require.resolve('next/navigation')

const mockNavigation = {
  useParams: () => ({ resourceId: 'alpha', communitySlug: 'guildpass-demo' }),
}

const mockWagmi: Partial<WagmiModule> = {
  useAccount: () =>
    ({ address: ADDRESS, isConnected: true } as unknown as ReturnType<WagmiModule['useAccount']>),
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
    if (key === 'resource') return { ...defaultResult, ...resourceQueryState }
    if (key === 'policy') return { ...defaultResult, ...policyQueryState }
    // Gated's own queries are never reached in these tests — every case
    // below returns before <Gated> renders — but must not throw if hit.
    return { ...defaultResult }
  }) as ReactQueryModule['useQuery'],
}

require.cache[wagmiPath] = { id: wagmiPath, loaded: true, exports: mockWagmi } as any
require.cache[reactQueryPath] = { id: reactQueryPath, loaded: true, exports: mockReactQuery } as any
require.cache[navigationPath] = { id: navigationPath, loaded: true, exports: mockNavigation } as any

const { default: DynamicResourceDocs } = require('../app/[communitySlug]/resources/[resourceId]/page') as PageModule

function render() {
  return renderToStaticMarkup(React.createElement(DynamicResourceDocs))
}

afterEach(() => {
  resourceQueryState = {}
  policyQueryState = {}
})

describe('Resource page states', () => {
  test('loading renders the resource skeleton, not denied/upgrade copy', () => {
    resourceQueryState = { isLoading: true }
    policyQueryState = { isLoading: true }

    const html = render()

    assert.match(html, /Loading resource/)
    assert.match(html, /aria-busy="true"/)
    assert.doesNotMatch(html, /Access denied/)
    assert.doesNotMatch(html, /Upgrade/)
  })

  test('network failure renders the operational error state with a retry action', () => {
    resourceQueryState = {
      data: {
        status: 'error',
        error: new ApiError({
          code: 'network_error',
          safeMessage: 'Unable to connect. Please check your connection and try again.',
          retryable: true,
        }),
      },
    }

    const html = render()

    assert.match(html, /Could not load resource/)
    assert.match(html, /Unable to connect/)
    assert.match(html, /Try again/)
    assert.doesNotMatch(html, /Resource not found/)
    assert.doesNotMatch(html, /Access denied/)
  })

  test('5xx failure renders the same operational error treatment', () => {
    resourceQueryState = {
      data: {
        status: 'error',
        error: new ApiError({
          status: 500,
          code: 'server_error',
          safeMessage: 'The server could not complete the request. Please try again.',
          retryable: true,
        }),
      },
    }

    const html = render()

    assert.match(html, /Could not load resource/)
    assert.doesNotMatch(html, /Access denied/)
  })

  test('policy fetch failure (previously silent) surfaces its own operational error, not denied or blank', () => {
    resourceQueryState = {
      data: {
        status: 'found',
        data: { id: 'alpha', title: 'Alpha Docs', minTier: 'standard', roles: [] },
        source: 'direct',
      },
    }
    policyQueryState = {
      isError: true,
      error: new ApiError({
        status: 500,
        code: 'server_error',
        safeMessage: 'The server could not complete the request. Please try again.',
        retryable: true,
      }),
    }

    const html = render()

    assert.match(html, /Could not load access requirements/)
    assert.doesNotMatch(html, /Access denied/)
    assert.doesNotMatch(html, /Alpha Docs/)
  })

  test('retrying disables the retry button and relabels it, preventing duplicate clicks', () => {
    resourceQueryState = {
      data: {
        status: 'error',
        error: new ApiError({ code: 'network_error', safeMessage: 'Unable to connect.', retryable: true }),
      },
      isFetching: true,
    }

    const html = render()

    assert.match(html, /Retrying…/)
    assert.match(html, /disabled=""/)
    assert.doesNotMatch(html, />Try again</)
  })

  test('not-found resource renders EmptyState, distinct from the operational error copy', () => {
    resourceQueryState = { data: { status: 'not_found' } }

    const html = render()

    assert.match(html, /Resource not found/)
    assert.doesNotMatch(html, /Could not load resource/)
    assert.doesNotMatch(html, /server/i)
    assert.doesNotMatch(html, /Access denied/)
  })

  test('no sensitive error details leak into the rendered markup', () => {
    resourceQueryState = {
      data: {
        status: 'error',
        error: new ApiError({
          status: 500,
          code: 'server_error',
          safeMessage: 'The server could not complete the request. Please try again.',
          retryable: true,
          path: '/v1/resources/alpha',
          cause: new Error('connect ECONNREFUSED 10.0.0.5:5432 secret-internal-host'),
        }),
      },
    }

    const html = render()

    assert.doesNotMatch(html, /10\.0\.0\.5/)
    assert.doesNotMatch(html, /secret-internal-host/)
    assert.doesNotMatch(html, /ECONNREFUSED/)
    assert.doesNotMatch(html, /\/v1\/resources/)
  })
})
