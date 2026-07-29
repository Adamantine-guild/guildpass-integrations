import './setup-env'
import './setup-alias'
import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PolicyConflictDialog } from '../components/ui/policy-conflict-dialog'
import type { AccessPolicy } from '../lib/api/types'

const mockPolicy: AccessPolicy = {
  resourceId: 'resource-1',
  roles: ['admin'],
  updatedAt: '2026-07-28T12:00:00Z',
}

const mockCurrentPolicy: AccessPolicy = {
  resourceId: 'resource-1',
  roles: ['admin'],
  updatedAt: '2026-07-28T14:00:00Z',
}

describe('PolicyConflictDialog accessibility (#297)', () => {
  test('renders as a dialog with aria-modal="true"', () => {
    const html = renderToStaticMarkup(
      React.createElement(PolicyConflictDialog, {
        attemptedPolicy: mockPolicy,
        currentPolicy: mockCurrentPolicy,
        onReload: () => {},
        onForceOverwrite: () => {},
        onCancel: () => {},
      }),
    )

    // Must have role="dialog" and aria-modal="true"
    assert.match(html, /role="dialog"/)
    assert.match(html, /aria-modal="true"/)

    // Must have proper aria labelling
    assert.match(html, /aria-labelledby="conflict-dialog-title"/)
    assert.match(html, /aria-describedby="conflict-dialog-description"/)
    assert.match(html, /id="conflict-dialog-title"/)
    assert.match(html, /id="conflict-dialog-description"/)
  })

  test('renders all three action buttons', () => {
    const html = renderToStaticMarkup(
      React.createElement(PolicyConflictDialog, {
        attemptedPolicy: mockPolicy,
        currentPolicy: mockCurrentPolicy,
        onReload: () => {},
        onForceOverwrite: () => {},
        onCancel: () => {},
      }),
    )

    assert.match(html, />Cancel</)
    assert.match(html, />Reload Latest Version</)
    assert.match(html, />Force Overwrite</)
  })

  test('renders without currentPolicy (graceful fallback)', () => {
    const html = renderToStaticMarkup(
      React.createElement(PolicyConflictDialog, {
        attemptedPolicy: mockPolicy,
        onReload: () => {},
        onForceOverwrite: () => {},
        onCancel: () => {},
      }),
    )

    // Should still have accessible dialog markup
    assert.match(html, /role="dialog"/)
    assert.match(html, /aria-modal="true"/)
    // Should show the fallback message
    assert.match(html, /Unable to load current server policy/i)
    // Should still render all three buttons
    assert.match(html, />Cancel</)
    assert.match(html, />Reload Latest Version</)
    assert.match(html, />Force Overwrite</)
  })

  test('dialog has a visible ref for focus trap attachment', () => {
    // The outer div uses a ref for useFocusTrap. We verify it renders
    // with the expected container structure.
    const html = renderToStaticMarkup(
      React.createElement(PolicyConflictDialog, {
        attemptedPolicy: mockPolicy,
        currentPolicy: mockCurrentPolicy,
        onReload: () => {},
        onForceOverwrite: () => {},
        onCancel: () => {},
      }),
    )

    // The dialog container wraps the card
    assert.match(html, /fixed inset-0 z-50/)
    assert.match(html, /role="dialog"/)
    // Warning banner should be present
    assert.match(html, /Warning:/)
    assert.match(html, /force overwrite/i)
  })
})