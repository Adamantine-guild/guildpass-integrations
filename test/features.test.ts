import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import type { FeatureFlagKey, FeatureFlags } from '../lib/features'

type FeatureCase = {
  key: FeatureFlagKey
  envVar: string
  mockDefault: boolean
  productionDefault: boolean
}

const featureCases: readonly FeatureCase[] = [
  { key: 'adminPolicies', envVar: 'NEXT_PUBLIC_FEATURE_ADMIN_POLICIES', mockDefault: true, productionDefault: true },
  { key: 'adminSettings', envVar: 'NEXT_PUBLIC_FEATURE_ADMIN_SETTINGS', mockDefault: true, productionDefault: false },
  { key: 'events', envVar: 'NEXT_PUBLIC_FEATURE_EVENTS', mockDefault: true, productionDefault: false },
  { key: 'resources', envVar: 'NEXT_PUBLIC_FEATURE_RESOURCES', mockDefault: true, productionDefault: true },
  { key: 'analytics', envVar: 'NEXT_PUBLIC_FEATURE_ANALYTICS', mockDefault: false, productionDefault: false },
  { key: 'governance', envVar: 'NEXT_PUBLIC_FEATURE_GOVERNANCE', mockDefault: false, productionDefault: false },
]

function clearEnvironment(): void {
  delete process.env.NEXT_PUBLIC_MOCK_MODE
  delete process.env.NEXT_PUBLIC_DEMO_MODE
  delete process.env.NEXT_PUBLIC_CORE_API_URL

  for (const feature of featureCases) {
    delete process.env[feature.envVar]
    delete process.env[`${feature.envVar}_ROLLOUT_PCT`]
  }
}

function resetConfigModules(): void {
  delete require.cache[require.resolve('../lib/config')]
  delete require.cache[require.resolve('../lib/features')]
}

function loadFeatures(): { features: FeatureFlags } {
  return require('../lib/features') as { features: FeatureFlags }
}

function loadFeatureInMode(mode: 'mock' | 'production', feature: FeatureCase, value?: string): boolean {
  if (mode === 'mock') {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
  } else {
    process.env.NEXT_PUBLIC_CORE_API_URL = 'http://localhost:4000'
  }
  if (value !== undefined) process.env[feature.envVar] = value
  return loadFeatures().features[feature.key]
}

describe('lib/config.ts and lib/features.ts feature flags', () => {
  beforeEach(() => {
    clearEnvironment()
    resetConfigModules()
  })

  for (const feature of featureCases) {
    describe(feature.key, () => {
      test('uses the documented mock-mode default when unset', () => {
        assert.equal(loadFeatureInMode('mock', feature), feature.mockDefault)
      })

      test('uses the documented production/live default when unset', () => {
        assert.equal(loadFeatureInMode('production', feature), feature.productionDefault)
      })

      test('enables when explicitly set to true', () => {
        assert.equal(loadFeatureInMode('mock', feature, 'true'), true)
      })

      test('disables when explicitly set to false', () => {
        assert.equal(loadFeatureInMode('mock', feature, 'false'), false)
      })
    })
  }

  test('malformed flag values disable the flag; empty string falls back to default', () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
    process.env.NEXT_PUBLIC_FEATURE_EVENTS = 'invalid'
    process.env.NEXT_PUBLIC_FEATURE_RESOURCES = ''
    const { features } = loadFeatures()
    assert.equal(features.events, false) // any value other than "true" disables
    assert.equal(features.resources, true) // empty string → default (mock mode)
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
    const { features } = loadFeatures()
    const { config } = require('../lib/config')
    assert.deepEqual(features, config.features)
  })
})
