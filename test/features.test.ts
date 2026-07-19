import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'

// We need to mock the environment before requiring lib/config.ts
// So we'll use a dynamic require with jest-style reset
describe('lib/config.ts and feature flags', () => {
  beforeEach(() => {
    // Reset all env vars before each test
    delete process.env.NEXT_PUBLIC_MOCK_MODE
    delete process.env.NEXT_PUBLIC_DEMO_MODE
    delete process.env.NEXT_PUBLIC_FEATURE_ADMIN_POLICIES
    delete process.env.NEXT_PUBLIC_FEATURE_EVENTS
    delete process.env.NEXT_PUBLIC_FEATURE_ANALYTICS
    delete process.env.NEXT_PUBLIC_FEATURE_RESOURCES
    delete process.env.NEXT_PUBLIC_FEATURE_GOVERNANCE
    delete process.env.NEXT_PUBLIC_FEATURE_ANALYTICS_ROLLOUT_PCT
    delete process.env.NEXT_PUBLIC_CORE_API_URL

    // Clear the require cache so we can re-import config.ts fresh each time
    delete require.cache[require.resolve('../lib/config')]
    delete require.cache[require.resolve('../lib/features')]
  })

  test('defaults in mock mode (NEXT_PUBLIC_MOCK_MODE=true)', () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
    const { config } = require('../lib/config')
    assert.equal(config.apiMode, 'mock')
    assert.equal(config.features.adminPolicies, true)
    assert.equal(config.features.events, true)
    assert.equal(config.features.analytics, false)
    assert.equal(config.features.resources, true)
    assert.equal(config.features.governance, false)
  })

  test('defaults in production mode (mock mode off)', () => {
    // For testing "live mode", we need to set required env vars to avoid ConfigError
    process.env.NEXT_PUBLIC_CORE_API_URL = 'http://localhost:4000'
    const { config } = require('../lib/config')
    assert.equal(config.apiMode, 'live')
    // Live-mode defaults are all false; adminPolicies/events/resources
    // default to true only in mock mode (see lib/config.ts + CLAUDE.md).
    assert.equal(config.features.adminPolicies, false)
    assert.equal(config.features.events, false)
    assert.equal(config.features.analytics, false)
    assert.equal(config.features.resources, false)
    assert.equal(config.features.governance, false)
  })

  test('explicit false flags disable features', () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
    process.env.NEXT_PUBLIC_FEATURE_ADMIN_POLICIES = 'false'
    process.env.NEXT_PUBLIC_FEATURE_EVENTS = 'false'
    process.env.NEXT_PUBLIC_FEATURE_RESOURCES = 'false'
    const { config } = require('../lib/config')
    assert.equal(config.features.adminPolicies, false)
    assert.equal(config.features.events, false)
    assert.equal(config.features.resources, false)
  })

  test('explicit true flags enable features', () => {
    process.env.NEXT_PUBLIC_CORE_API_URL = 'http://localhost:4000'
    process.env.NEXT_PUBLIC_FEATURE_EVENTS = 'true'
    process.env.NEXT_PUBLIC_FEATURE_ANALYTICS = 'true'
    process.env.NEXT_PUBLIC_FEATURE_GOVERNANCE = 'true'
    const { config } = require('../lib/config')
    assert.equal(config.features.events, true)
    assert.equal(config.features.analytics, true)
    assert.equal(config.features.governance, true)
  })

  test('malformed flag values disable the flag; empty string falls back to default', () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
    process.env.NEXT_PUBLIC_FEATURE_EVENTS = 'invalid'
    process.env.NEXT_PUBLIC_FEATURE_RESOURCES = ''
    const { config } = require('../lib/config')
    assert.equal(config.features.events, false) // any value other than "true" disables
    assert.equal(config.features.resources, true) // empty string → default (mock mode)
  })

  test('rollout percentage is deterministic for an identifier', () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
    process.env.NEXT_PUBLIC_FEATURE_ANALYTICS_ROLLOUT_PCT = '25'
    const { featureBucket, getFeatureRollout, isFeatureEnabled } = require('../lib/features')
    const rollout = getFeatureRollout('analytics')
    const first = isFeatureEnabled(rollout, '0xabc123')
    const second = isFeatureEnabled(rollout, '0xabc123')
    assert.equal(rollout.rolloutPercentage, 25)
    assert.equal(first, second)
    assert.equal(first, featureBucket('analytics:0xabc123') < 25)
  })

  test('omitted rollout percentage preserves binary flag behavior', () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
    process.env.NEXT_PUBLIC_FEATURE_ANALYTICS = 'true'
    const { getFeatureRollout, isFeatureEnabled } = require('../lib/features')
    const rollout = getFeatureRollout('analytics')
    assert.equal(rollout.rolloutPercentage, undefined)
    assert.equal(isFeatureEnabled(rollout, '0xabc123'), true)
    assert.equal(isFeatureEnabled(rollout, null), true)
  })

  test('rollout percentage boundaries clamp to disabled and enabled', () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
    process.env.NEXT_PUBLIC_FEATURE_ANALYTICS_ROLLOUT_PCT = '0'
    let featureHelpers = require('../lib/features')
    assert.equal(
      featureHelpers.isFeatureEnabled(featureHelpers.getFeatureRollout('analytics'), '0xabc123'),
      false,
    )

    delete require.cache[require.resolve('../lib/features')]
    process.env.NEXT_PUBLIC_FEATURE_ANALYTICS_ROLLOUT_PCT = '100'
    featureHelpers = require('../lib/features')
    assert.equal(
      featureHelpers.isFeatureEnabled(featureHelpers.getFeatureRollout('analytics'), '0xabc123'),
      true,
    )
  })

  test('lib/features.ts exports config.features', () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
    const { features } = require('../lib/features')
    const { config } = require('../lib/config')
    assert.deepEqual(features, config.features)
  })
})
