/**
 * test/admin-settings-flag.test.ts
 *
 * Verifies that the advanced admin "Community Settings" module at
 * /admin/settings is controlled by a typed feature flag
 * (NEXT_PUBLIC_FEATURE_ADMIN_SETTINGS), matching the other incomplete modules
 * covered by issue #36.
 *
 * Acceptance criteria exercised here:
 *   - Disabled routes render a clear unavailable state (FeatureGate).
 *   - Local mock mode enables demo-only features by default.
 *   - Live/production defaults to disabled until the settings backend ships.
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

function loadFeatures(): { adminSettings: boolean; [key: string]: boolean } {
  clearConfigCache()
  return require('../lib/features').features
}

// ── FeatureGate render helper ─────────────────────────────────────────────────

function renderSettingsGate(enabled: boolean): string {
  const child = React.createElement(
    'div',
    { 'data-testid': 'settings-content' },
    'Community Settings',
  )
  return renderToStaticMarkup(
    React.createElement(FeatureGate, { enabled, name: 'Community Settings', children: child }),
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('adminSettings feature flag (issue #36)', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_FEATURE_ADMIN_SETTINGS
    delete process.env.NEXT_PUBLIC_MOCK_MODE
    delete process.env.NEXT_PUBLIC_DEMO_MODE
    delete process.env.NEXT_PUBLIC_CORE_API_URL
    clearConfigCache()
  })

  // ── Default-on in mock mode ─────────────────────────────────────────────────

  test('adminSettings flag defaults to true in mock mode', () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
    const features = loadFeatures()
    assert.equal(
      features.adminSettings,
      true,
      'adminSettings should default to true in mock/demo mode for the full demo',
    )
  })

  // ── Default-off in live mode ────────────────────────────────────────────────

  test('adminSettings flag defaults to false in live mode', () => {
    process.env.NEXT_PUBLIC_CORE_API_URL = 'http://localhost:4000'
    const features = loadFeatures()
    assert.equal(
      features.adminSettings,
      false,
      'adminSettings should default to false in live mode until persistence ships',
    )
  })

  // ── Explicit overrides ──────────────────────────────────────────────────────

  test('adminSettings flag is false when NEXT_PUBLIC_FEATURE_ADMIN_SETTINGS=false', () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
    process.env.NEXT_PUBLIC_FEATURE_ADMIN_SETTINGS = 'false'
    const features = loadFeatures()
    assert.equal(features.adminSettings, false)
  })

  test('adminSettings flag is true when NEXT_PUBLIC_FEATURE_ADMIN_SETTINGS=true', () => {
    process.env.NEXT_PUBLIC_CORE_API_URL = 'http://localhost:4000'
    process.env.NEXT_PUBLIC_FEATURE_ADMIN_SETTINGS = 'true'
    const features = loadFeatures()
    assert.equal(features.adminSettings, true)
  })

  // ── FeatureGate renders clear unavailable state when disabled ───────────────

  test('FeatureGate hides settings content when flag is false', () => {
    const html = renderSettingsGate(false)
    assert.doesNotMatch(
      html,
      /Community Settings/,
      'settings page content must not be rendered when flag is false',
    )
  })

  test('FeatureGate shows clear unavailable state when flag is false', () => {
    const html = renderSettingsGate(false)
    assert.match(
      html,
      /Community Settings is not available/,
      'FeatureUnavailable must name the module and explain it is disabled',
    )
  })

  test('FeatureGate links back to dashboard when flag is false', () => {
    const html = renderSettingsGate(false)
    assert.match(
      html,
      /Back to Dashboard/,
      'disabled settings route should offer a way back to the dashboard',
    )
  })

  test('FeatureGate renders settings content when flag is true', () => {
    const html = renderSettingsGate(true)
    assert.match(
      html,
      /Community Settings/,
      'settings content should render when flag is true',
    )
    assert.doesNotMatch(
      html,
      /is not available/,
      'FeatureUnavailable must not be shown when flag is true',
    )
  })
})
