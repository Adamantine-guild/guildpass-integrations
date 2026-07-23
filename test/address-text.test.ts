import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AddressText } from '../components/wallet/address-text'

const ADDRESS = '0x1234567890abcdef1234567890ABCDEF12345678'

function renderAddress(props: React.ComponentProps<typeof AddressText>) {
  return renderToStaticMarkup(React.createElement(AddressText, props))
}

describe('AddressText', () => {
  test('renders a shortened address with the full address available', () => {
    const html = renderAddress({ address: ADDRESS })

    assert.match(html, />0x1234...5678</)
    assert.match(html, new RegExp(`title="${ADDRESS}"`))
    assert.match(html, new RegExp(`aria-label="Wallet address: ${ADDRESS}"`))
    assert.match(html, new RegExp(`data-address="${ADDRESS}"`))
  })

  test('honors formatting options', () => {
    const html = renderAddress({
      address: ADDRESS,
      options: { start: 10, end: 8, separator: '--' },
    })

    assert.match(html, />0x12345678--12345678</)
  })

  test('renders missing addresses accessibly', () => {
    const html = renderAddress({ address: null, options: { fallback: 'No wallet' } })

    assert.match(html, />No wallet</)
    assert.match(html, /aria-label="Wallet address unavailable"/)
    assert.doesNotMatch(html, /title=/)
  })

  test('renders invalid addresses safely and labels the format state', () => {
    const html = renderAddress({ address: '0xabc' })

    assert.match(html, />0xabc</)
    assert.match(html, /title="0xabc"/)
    assert.match(html, /aria-label="Wallet address: 0xabc \(unverified format\)"/)
  })

  test('can render non-wallet identifiers without invalid address wording', () => {
    const html = renderAddress({
      address: 'alpha-resource',
      label: 'Target address or resource',
      announceInvalid: false,
    })

    assert.match(html, />alpha-resource</)
    assert.match(html, /aria-label="Target address or resource: alpha-resource"/)
    assert.doesNotMatch(html, /unverified format/)
  })

  test('allows custom labels and aria labels', () => {
    const html = renderAddress({
      address: ADDRESS,
      label: 'Connected account',
      'aria-label': 'Current connected account',
    })

    assert.match(html, /aria-label="Current connected account"/)
    assert.doesNotMatch(html, /Connected account:/)
  })
})
