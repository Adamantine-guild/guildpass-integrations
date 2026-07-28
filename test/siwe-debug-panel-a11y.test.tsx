import './setup-env'
import './setup-alias'
import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SiweDebugPanel } from '../components/developer/siwe-debug-panel'

describe('SiweDebugPanel accessibility (#302)', () => {
  test('toggle button has aria-expanded and aria-controls linking to content id', () => {
    const html = renderToStaticMarkup(React.createElement(SiweDebugPanel))
    assert.match(html, /aria-expanded="true"/)
    assert.match(html, /aria-controls="siwe-debug-content"/)
    assert.match(html, /aria-label="Hide SIWE debug panel"/)
  })

  test('panel content has matching id, role="status", and aria-live="polite"', () => {
    const html = renderToStaticMarkup(React.createElement(SiweDebugPanel))
    assert.match(html, /id="siwe-debug-content"/)
    assert.match(html, /role="status"/)
    assert.match(html, /aria-live="polite"/)
  })
})
