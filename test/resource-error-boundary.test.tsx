import './setup-alias'
import { describe, test, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ResourceError from '../app/[communitySlug]/resources/[resourceId]/error'

const originalNodeEnv = process.env.NODE_ENV

/** NODE_ENV is typed readonly by Next's global env augmentation; tests need to vary it. */
function setNodeEnv(value: string | undefined) {
  ;(process.env as Record<string, string | undefined>).NODE_ENV = value
}

function render(error: Error & { digest?: string }) {
  return renderToStaticMarkup(React.createElement(ResourceError, { error, reset: () => {} }))
}

afterEach(() => {
  setNodeEnv(originalNodeEnv)
})

describe('Resource route error boundary', () => {
  test('shows a clear operational heading, explanation, retry button, and a safe back link', () => {
    const html = render(new Error('boom'))

    assert.match(html, /This resource couldn.*t be displayed/)
    assert.match(html, /Something went wrong while rendering this page/)
    assert.match(html, /Try again/)
    assert.match(html, /Back to Dashboard/)
    assert.match(html, /href="\/guildpass-demo\/dashboard"/)
  })

  test('shows dev-only details outside production, including message and digest', () => {
    setNodeEnv('development')
    const html = render(Object.assign(new Error('resource lookup failed'), { digest: 'abc123' }))

    assert.match(html, /Error details \(development only\)/)
    assert.match(html, /resource lookup failed/)
    assert.match(html, /abc123/)
  })

  test('hides dev-only details in production and never renders a raw stack trace', () => {
    setNodeEnv('production')
    const error = new Error('resource lookup failed')
    error.stack = 'Error: resource lookup failed\n    at file:///Users/dev/secret-project/internal.js:42:9'

    const html = render(error)

    assert.doesNotMatch(html, /Error details/)
    assert.doesNotMatch(html, /secret-project/)
    assert.doesNotMatch(html, /at file:\/\//)
  })

  test('omits the digest line rather than rendering the literal string "undefined" when digest is absent', () => {
    setNodeEnv('development')
    const html = render(new Error('resource lookup failed'))

    assert.match(html, /Error details \(development only\)/)
    assert.doesNotMatch(html, /Digest: undefined/)
  })
})
