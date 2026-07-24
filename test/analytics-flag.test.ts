/**
 * test/analytics-flag.test.ts
 *
 * Verifies that the analytics module is fully hidden when
 * NEXT_PUBLIC_FEATURE_ANALYTICS is false (the default in every environment),
 * and becomes accessible when the flag is explicitly set to "true".
 *
 * Acceptance criterion from issue #157:
 *   "Route is fully hidden when the flag is false (the default everywhere),
 *    verified by test."
 */
import './setup-env'
import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FeatureGate } from '../components/feature-gate'

// ── Setup Mocks for component routing/query dependencies ────────────────────
const mockWagmi = {
  useAccount: () => ({ isConnected: true, address: '0x1234567890abcdef1234567890ABCDEF12345678' }),
  useConnect: () => ({ connect: () => {}, isPending: false }),
  useDisconnect: () => ({ disconnect: () => {} }),
  injected: () => ({})
}
require.cache[require.resolve('wagmi')] = {
  id: require.resolve('wagmi'),
  loaded: true,
  exports: mockWagmi
} as any

const mockNextNavigation = {
  usePathname: () => '/admin/analytics',
  useParams: () => ({ communitySlug: 'guildpass-demo' }),
}
require.cache[require.resolve('next/navigation')] = {
  id: require.resolve('next/navigation'),
  loaded: true,
  exports: mockNextNavigation
} as any

const mockNextLink = React.forwardRef(({ href, children, ...props }: any, ref: any) => {
  return React.createElement('a', { href, ref, ...props }, children)
})
require.cache[require.resolve('next/link')] = {
  id: require.resolve('next/link'),
  loaded: true,
  exports: mockNextLink
} as any

const mockReactQuery = {
  // A single blanket useQuery mock backs every call in the tree — both
  // AdminGuard's session lookup (needs `roles`) and AnalyticsContent's
  // summary query (needs the ComputedAnalyticsSummary shape) share this same
  // canned response, since the mock doesn't distinguish by query key.
  useQuery: () => ({
    data: {
      roles: ['admin'],
      totalMembers: 100,
      activeMembers: 50,
      roleDistribution: [
        { role: 'member', count: 80 },
        { role: 'moderator', count: 15 },
        { role: 'admin', count: 5 },
      ],
      tierDistribution: [
        { tier: 'free', count: 40 },
        { tier: 'standard', count: 40 },
        { tier: 'pro', count: 20 },
      ],
      signupsOverTime: [{ date: '2026-01-01', count: 3 }],
      generatedAt: new Date().toISOString()
    },
    isLoading: false,
    isError: false,
    refetch: () => {}
  }),
  queryKeys: {
    session: {
      byAddress: () => ['session']
    },
    analytics: {
      summary: ['analytics', 'summary']
    }
  }
}
require.cache[require.resolve('@tanstack/react-query')] = {
  id: require.resolve('@tanstack/react-query'),
  loaded: true,
  exports: mockReactQuery
} as any

const mockWalletProviders = {
  useSiweAuth: () => ({
    sessionStatus: 'authenticated',
    authSession: { token: 'mock-token' },
    isSigningIn: false,
    signIn: () => {},
    logout: () => {},
    error: null,
    markExpired: () => {}
  })
}
const providersPath = require.resolve('../lib/wallet/providers')
require.cache[providersPath] = {
  id: providersPath,
  loaded: true,
  exports: mockWalletProviders
} as any

// ── Feature-flag / config cache helpers ──────────────────────────────────────

function clearConfigCache() {
  delete require.cache[require.resolve('../lib/config')]
  delete require.cache[require.resolve('../lib/features')]
}

function loadFeatures(): { analytics: boolean; [key: string]: boolean } {
  clearConfigCache()
  return require('../lib/features').features
}

// ── FeatureGate render helper ─────────────────────────────────────────────────

function renderAnalyticsGate(enabled: boolean): string {
  const child = React.createElement(
    'div',
    { 'data-testid': 'analytics-content' },
    'Analytics Dashboard',
  )
  return renderToStaticMarkup(
    React.createElement(FeatureGate, { enabled, name: 'Analytics', children: child }),
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Analytics feature flag', () => {
  beforeEach(() => {
    // Restore a clean environment before each test
    delete process.env.NEXT_PUBLIC_FEATURE_ANALYTICS
    delete process.env.NEXT_PUBLIC_MOCK_MODE
    delete process.env.NEXT_PUBLIC_DEMO_MODE
    delete process.env.NEXT_PUBLIC_CORE_API_URL
    clearConfigCache()
  })

  // ── Default-off in mock mode ───────────────────────────────────────────────

  test('analytics flag defaults to false in mock mode', () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
    const features = loadFeatures()
    assert.equal(
      features.analytics,
      false,
      'analytics should default to false even when mock mode is enabled',
    )
  })

  // ── Default-off in live mode ───────────────────────────────────────────────

  test('analytics flag defaults to false in live mode', () => {
    process.env.NEXT_PUBLIC_CORE_API_URL = 'http://localhost:4000'
    const features = loadFeatures()
    assert.equal(
      features.analytics,
      false,
      'analytics should default to false in live mode',
    )
  })

  // ── Explicit false ─────────────────────────────────────────────────────────

  test('analytics flag is false when NEXT_PUBLIC_FEATURE_ANALYTICS=false', () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
    process.env.NEXT_PUBLIC_FEATURE_ANALYTICS = 'false'
    const features = loadFeatures()
    assert.equal(features.analytics, false)
  })

  // ── Explicit true ──────────────────────────────────────────────────────────

  test('analytics flag is true when NEXT_PUBLIC_FEATURE_ANALYTICS=true', () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
    process.env.NEXT_PUBLIC_FEATURE_ANALYTICS = 'true'
    const features = loadFeatures()
    assert.equal(features.analytics, true)
  })

  // ── FeatureGate hides content when disabled ────────────────────────────────

  test('FeatureGate hides analytics content when flag is false', () => {
    const html = renderAnalyticsGate(false)
    assert.doesNotMatch(
      html,
      /Analytics Dashboard/,
      'analytics page content must not be rendered when flag is false',
    )
  })

  test('FeatureGate shows "Analytics is not available" when flag is false', () => {
    const html = renderAnalyticsGate(false)
    assert.match(
      html,
      /Analytics is not available/,
      'FeatureUnavailable message should include the module name',
    )
  })

  test('FeatureGate renders analytics content when flag is true', () => {
    const html = renderAnalyticsGate(true)
    assert.match(
      html,
      /Analytics Dashboard/,
      'analytics page content should render when flag is true',
    )
    assert.doesNotMatch(
      html,
      /Analytics is not available/,
      'FeatureUnavailable must not be shown when flag is true',
    )
  })

  // ── FeatureUnavailable links back to dashboard ─────────────────────────────

  test('FeatureUnavailable provides a link back to the dashboard', () => {
    const html = renderAnalyticsGate(false)
    assert.match(
      html,
      /Back to Dashboard/,
      'disabled analytics page should offer navigation back to dashboard',
    )
  })

  // ── Nav item visibility tests ──────────────────────────────────────────────

  test('Nav component hides Analytics link when flag is false', () => {
    // Clear config cache to reload features with default analytics = false
    delete process.env.NEXT_PUBLIC_FEATURE_ANALYTICS
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
    clearConfigCache()
    
    // Import Nav dynamically so it gets the fresh features/config
    delete require.cache[require.resolve('../components/nav')]
    const { Nav } = require('../components/nav')
    
    const html = renderToStaticMarkup(React.createElement(Nav))
    assert.doesNotMatch(
      html,
      /href="\/admin\/analytics"/,
      'navigation must not render Analytics link when analytics flag is false',
    )
  })

  test('Nav component shows Analytics link when flag is true', () => {
    process.env.NEXT_PUBLIC_FEATURE_ANALYTICS = 'true'
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
    clearConfigCache()
    
    delete require.cache[require.resolve('../components/nav')]
    const { Nav } = require('../components/nav')
    
    const html = renderToStaticMarkup(React.createElement(Nav))
    assert.match(
      html,
      /href="\/admin\/analytics"/,
      'navigation must render Analytics link when analytics flag is true',
    )
  })

  // ── Route-level fallback test ──────────────────────────────────────────────

  test('visiting AnalyticsPage directly renders FeatureUnavailable when flag is false', () => {
    delete process.env.NEXT_PUBLIC_FEATURE_ANALYTICS
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
    clearConfigCache()
    
    delete require.cache[require.resolve('../app/[communitySlug]/admin/analytics/page')]
    const AnalyticsPage = require('../app/[communitySlug]/admin/analytics/page').default
    
    const html = renderToStaticMarkup(React.createElement(AnalyticsPage))
    assert.match(
      html,
      /Analytics is not available/,
      'direct visit to AnalyticsPage must show FeatureUnavailable when flag is false',
    )
  })

  // ── Route-level content test ───────────────────────────────────────────────

  test('visiting AnalyticsPage renders real computed content when flag is true', () => {
    process.env.NEXT_PUBLIC_FEATURE_ANALYTICS = 'true'
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
    clearConfigCache()

    delete require.cache[require.resolve('../app/[communitySlug]/admin/analytics/page')]
    const AnalyticsPage = require('../app/[communitySlug]/admin/analytics/page').default

    const html = renderToStaticMarkup(React.createElement(AnalyticsPage))
    assert.doesNotMatch(
      html,
      /Analytics is not available/,
      'analytics content must render when the flag is true and the session is authenticated',
    )
    assert.match(html, /Total Members/)
    assert.match(html, /Role Distribution/)
    assert.match(html, /Tier Distribution/)
    assert.match(html, /New Members Over Time/)
    // No mention of the retired provisional-endpoint / mock-data caveat.
    assert.doesNotMatch(html, /pending backend confirmation/)
  })
})

