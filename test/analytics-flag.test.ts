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
import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FeatureGate } from '../components/feature-gate'

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
})
