import './setup-env'
import './setup-alias'
import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BulkActionToolbar, type BulkResult } from '../components/ui/bulk-action-toolbar'

function renderToolbar({
  selectedCount = 2,
  totalCount = 10,
  isPending = false,
  results = null as BulkResult | null,
} = {}): string {
  return renderToStaticMarkup(
    React.createElement(BulkActionToolbar, {
      selectedCount,
      totalCount,
      onDismiss: () => {},
      onBulkAction: async () => {},
      actionLabel: 'Apply Action',
      isPending,
      results,
      onRetryFailed: async () => {},
    }),
  )
}

describe('BulkActionToolbar accessibility (#302)', () => {
  test('selection count badge has role="status" and aria-live="polite"', () => {
    const html = renderToolbar({ selectedCount: 3, totalCount: 15 })
    assert.match(html, /role="status"/)
    assert.match(html, /aria-live="polite"/)
    assert.match(html, /3 of 15 selected/)
  })

  test('buttons have aria-disabled and aria-busy when idle vs pending', () => {
    const htmlIdle = renderToolbar({ isPending: false, selectedCount: 2 })
    assert.match(htmlIdle, /aria-disabled="false"/)
    assert.match(htmlIdle, /aria-busy="false"/)

    const htmlPending = renderToolbar({ isPending: true, selectedCount: 2 })
    assert.match(htmlPending, /aria-disabled="true"/)
    assert.match(htmlPending, /aria-busy="true"/)
    assert.match(htmlPending, /Applying…/)
  })

  test('action button is disabled and aria-disabled when selection count is 0', () => {
    const html = renderToolbar({ selectedCount: 0 })
    assert.match(html, /aria-disabled="true"/)
  })

  test('results summary section is rendered with role="status" and aria-live="polite"', () => {
    const results: BulkResult = {
      succeeded: 2,
      failed: 1,
      items: [{ address: '0x1234567890123456789012345678901234567890', status: 'error', error: 'Failed' }],
    }
    const html = renderToolbar({ results })
    assert.match(html, /role="status"/)
    assert.match(html, /aria-live="polite"/)
    assert.match(html, /2 succeeded/)
    assert.match(html, /1 failed/)
    assert.match(html, /Retry failed/)
    assert.match(html, /aria-disabled="false"/)
  })
})
