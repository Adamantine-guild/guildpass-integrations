import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Skeleton } from '../components/ui/skeleton'
import { MembershipCardSkeleton } from '../components/dashboard/membership-card-skeleton'

test('skeleton uses theme tokens and stays hidden from assistive technology', () => {
  const html = renderToStaticMarkup(
    React.createElement(Skeleton, { className: 'h-5 w-16 rounded-full' }),
  )

  assert.match(html, /aria-hidden="true"/)
  assert.match(html, /animate-pulse/)
  assert.match(html, /bg-muted/)
  assert.match(html, /h-5/)
  assert.match(html, /w-16/)
  assert.match(html, /rounded-full/)
})

test('membership skeleton reserves the loaded layout and exposes one loading status', () => {
  const html = renderToStaticMarkup(
    React.createElement(MembershipCardSkeleton),
  )

  assert.match(html, /role="status"/)
  assert.match(html, /aria-busy="true"/)
  assert.match(html, /min-h-\[116px\]/)
  assert.match(html, /Loading membership details/)
  assert.equal((html.match(/aria-hidden="true"/g) ?? []).length, 7)
})
