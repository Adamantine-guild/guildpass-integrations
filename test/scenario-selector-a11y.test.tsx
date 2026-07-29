import './setup-env'
import './setup-alias'
import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ScenarioSelector } from '../components/developer/scenario-selector'
import { config } from '../lib/config'

describe('ScenarioSelector accessibility (#302)', () => {
  test('renders landmark region with aria-label in mock mode', () => {
    // Config in setup-env or default is mock mode
    const html = renderToStaticMarkup(React.createElement(ScenarioSelector))
    if (config.apiMode === 'mock') {
      assert.match(html, /role="region"/)
      assert.match(html, /aria-label="Mock Scenario Tester"/)
    }
  })

  test('label explicitly targets select element id and select has aria-label', () => {
    if (config.apiMode !== 'mock') return
    const html = renderToStaticMarkup(React.createElement(ScenarioSelector))
    const forMatch = html.match(/<label[^>]*for="([^"]+)"/)
    assert.ok(forMatch, 'expected label with for attribute')
    const selectId = forMatch[1]
    assert.match(html, new RegExp(`id="${selectId}"`))
    assert.match(html, /aria-label="Select mock scenario"/)
  })

  test('buttons have default aria-disabled and aria-busy attributes', () => {
    if (config.apiMode !== 'mock') return
    const html = renderToStaticMarkup(React.createElement(ScenarioSelector))
    assert.match(html, /aria-disabled="false"/)
    assert.match(html, /aria-busy="false"/)
    assert.match(html, /Apply Scenario/)
    assert.match(html, /Reset/)
  })
})
