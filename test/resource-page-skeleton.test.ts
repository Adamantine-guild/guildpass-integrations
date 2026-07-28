import './setup-alias'
import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResourcePageSkeleton } from '../components/resources/resource-page-skeleton'

test('resource page skeleton is an accessible, distinct loading state', () => {
  const html = renderToStaticMarkup(React.createElement(ResourcePageSkeleton))

  assert.match(html, /role="status"/)
  assert.match(html, /aria-busy="true"/)
  assert.match(html, /aria-live="polite"/)
  assert.match(html, /Loading resource/)
  assert.match(html, /motion-safe:animate-pulse/)

  // Must never show denied/upgrade/not-found copy while loading.
  assert.doesNotMatch(html, /Access denied/)
  assert.doesNotMatch(html, /Upgrade/)
  assert.doesNotMatch(html, /not found/i)
})
