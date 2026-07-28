import assert from 'node:assert/strict'
import test from 'node:test'
import { createPageMetadata } from '../lib/page-metadata'

test('creates distinct page and Open Graph metadata with GuildPass branding', () => {
  const metadata = createPageMetadata(
    'Member Dashboard',
    'Review your membership.',
  )

  assert.equal(metadata.title, 'Member Dashboard')
  assert.equal(metadata.description, 'Review your membership.')
  assert.deepEqual(metadata.openGraph, {
    title: 'Member Dashboard | GuildPass',
    description: 'Review your membership.',
    siteName: 'GuildPass',
    type: 'website',
  })
})
