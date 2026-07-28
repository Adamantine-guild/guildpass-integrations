import './setup-env'
import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FeatureGate, FeatureUnavailable } from '../components/feature-gate'

function renderFeatureGate(props: React.ComponentProps<typeof FeatureGate>) {
  return renderToStaticMarkup(React.createElement(FeatureGate, props))
}

describe('FeatureUnavailable', () => {
  test('renders correct title and message for feature', () => {
    const html = renderToStaticMarkup(
      React.createElement(FeatureUnavailable, { name: 'Test Feature' })
    )
    assert.match(html, /Test Feature is not available/)
    assert.match(html, /This module is not enabled in the current environment/)
    assert.match(html, /Back to Dashboard/)
  })
})

describe('FeatureGate', () => {
  test('renders children when enabled is true', () => {
    const html = renderFeatureGate({
      enabled: true,
      name: 'Test Feature',
      children: React.createElement('div', { 'data-testid': 'child' }, 'Hello World'),
    })
    assert.match(html, /Hello World/)
    assert.doesNotMatch(html, /Test Feature is not available/)
  })

  test('renders children for a matching rollout bucket', () => {
    const html = renderFeatureGate({
      enabled: { enabled: false, key: 'analytics', rolloutPercentage: 100 },
      rolloutIdentifier: '0xabc123',
      name: 'Analytics',
      children: React.createElement('div', null, 'Canary content'),
    })
    assert.match(html, /Canary content/)
  })

  test('renders FeatureUnavailable when rollout has no identifier', () => {
    const html = renderFeatureGate({
      enabled: { enabled: false, key: 'analytics', rolloutPercentage: 100 },
      name: 'Analytics',
      children: React.createElement('div', null, 'Should not render'),
    })
    assert.match(html, /Analytics is not available/)
    assert.doesNotMatch(html, /Should not render/)
  })

  test('renders FeatureUnavailable when enabled is false', () => {
    const html = renderFeatureGate({
      enabled: false,
      name: 'Events',
      children: React.createElement('div', null, 'Should not render'),
    })
    assert.match(html, /Events is not available/)
    assert.doesNotMatch(html, /Should not render/)
  })
})
