import './setup-alias'
import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Skeleton } from '../components/ui/skeleton'
import { MembershipCardSkeleton } from '../components/dashboard/membership-card-skeleton'
import { AnalyticsSkeleton } from '../components/admin/analytics-skeleton'
import { RewardsSkeleton } from '../components/admin/rewards-skeleton'

test('skeleton uses theme tokens and stays hidden from assistive technology', () => {
  const html = renderToStaticMarkup(
    React.createElement(Skeleton, { className: 'h-5 w-16 rounded-full' }),
  )

  assert.match(html, /aria-hidden="true"/)
  assert.match(html, /motion-safe:animate-pulse/)
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

test('analytics skeleton reserves the analytics layout and exposes one loading status', () => {
  const html = renderToStaticMarkup(
    React.createElement(AnalyticsSkeleton),
  )

  assert.match(html, /role="status"/)
  assert.match(html, /aria-busy="true"/)
  assert.match(html, /Loading analytics/)
  // Should have stat cards (3 skeleton cards)
  assert.equal((html.match(/class="[^"]*rounded-lg border[^"]*"/g) ?? []).length, 6)
  // Should have skeleton bars inside each card
  assert.ok(html.includes('h-9'))
  assert.ok(html.includes('h-2'))
  // All inner skeleton elements should be hidden from AT
  assert.ok(html.includes('aria-hidden="true"'))
})

test('rewards skeleton reserves the rewards layout and exposes one loading status', () => {
  const html = renderToStaticMarkup(
    React.createElement(RewardsSkeleton),
  )

  assert.match(html, /role="status"/)
  assert.match(html, /aria-busy="true"/)
  assert.match(html, /Loading rewards/)
  // Should have member reward cards
  assert.ok(html.includes('rounded-lg border'))
  // Should have skeleton elements for roles badges
  assert.ok(html.includes('rounded-full'))
  // All inner skeleton elements should be hidden from AT
  assert.ok(html.includes('aria-hidden="true"'))
})
