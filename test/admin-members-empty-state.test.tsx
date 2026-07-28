import './setup-env'
import './setup-alias'
import { describe, test, after } from 'node:test'
import * as assert from 'node:assert/strict'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

type ReactQueryModule = typeof import('@tanstack/react-query')
type ProvidersModule = typeof import('../lib/wallet/providers')
type WagmiModule = typeof import('wagmi')

const ADDRESS = '0x0000000000000000000000000000000000000abc'

const mockReactQuery = {
  useInfiniteQuery: () => ({
    data: {
      pages: [{ members: [], nextCursor: undefined, isFallback: false }],
    },
    isLoading: false,
    isError: false,
    error: null,
    hasNextPage: false,
    fetchNextPage: () => Promise.resolve(),
    isFetchingNextPage: false,
    refetch: () => Promise.resolve(),
  }),
  useMutation: () => ({
    mutate: () => {},
    isPending: false,
    isError: false,
    error: null,
    reset: () => {},
  }),
  useQueryClient: () => ({
    cancelQueries: async () => {},
    getQueriesData: () => [],
    setQueriesData: () => {},
    setQueryData: () => {},
    invalidateQueries: async () => {},
  }),
}

const reactQueryPath = require.resolve('@tanstack/react-query')
const providersPath = require.resolve('../lib/wallet/providers')
const wagmiPath = require.resolve('wagmi')

require.cache[reactQueryPath] = { id: reactQueryPath, loaded: true, exports: mockReactQuery } as any

require.cache[providersPath] = {
  id: providersPath,
  loaded: true,
  exports: {
    useSiweAuth: () => ({
      authSession: { token: 'test-token' },
      isAuthenticated: true,
      sessionStatus: 'authenticated',
      status: 'authenticated',
      timeLeft: 3600,
      isSigningIn: false,
      error: null,
      signIn: async () => {},
      login: async () => {},
      logout: async () => {},
      markExpired: () => {},
      registerPendingRetry: () => {},
    }),
  },
} as any

require.cache[wagmiPath] = {
  id: wagmiPath,
  loaded: true,
  exports: {
    useAccount: () => ({
      address: ADDRESS,
      isConnected: true,
    }),
  },
} as any

const adminGuardPath = require.resolve('../components/admin-guard')
require.cache[adminGuardPath] = {
  id: adminGuardPath,
  loaded: true,
  exports: {
    AdminGuard: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  },
} as any

const MembersPage = require('../app/[communitySlug]/admin/members/page').default as React.ComponentType

function renderMembersPage() {
  return renderToStaticMarkup(React.createElement(MembersPage))
}

describe('MembersPage empty state', () => {
  test('renders a clear empty state and hides the member list headers', () => {
    const html = renderMembersPage()

    assert.match(html, /No members yet/)
    assert.match(html, /This community does not have any members yet\./)
    assert.match(html, /View onboarding docs/)
    assert.doesNotMatch(html, /Member List/)
    assert.doesNotMatch(html, /Page 1 of/)
  })
})
