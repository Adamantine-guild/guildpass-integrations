import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import { formatAddress, isWalletAddress, normalizeAddress } from '../lib/wallet/address'

const ADDRESS = '0x1234567890abcdef1234567890ABCDEF12345678'

describe('formatAddress', () => {
  test('shortens valid wallet addresses consistently', () => {
    assert.equal(formatAddress(ADDRESS), '0x1234...5678')
  })

  test('supports custom visible segments and separators', () => {
    assert.equal(
      formatAddress(ADDRESS, { start: 8, end: 6, separator: ':' }),
      '0x123456:345678',
    )
  })

  test('can render a full valid address when requested', () => {
    assert.equal(formatAddress(ADDRESS, { full: true }), ADDRESS)
  })

  test('renders missing addresses with a safe fallback', () => {
    assert.equal(formatAddress(undefined), '-')
    assert.equal(formatAddress('   ', { fallback: 'No wallet' }), 'No wallet')
  })

  test('renders invalid addresses without throwing', () => {
    assert.equal(formatAddress('0xabc'), '0xabc')
    assert.equal(formatAddress('0xabc', { invalidFallback: 'Invalid wallet' }), 'Invalid wallet')
  })

  test('normalizes whitespace before formatting and validation', () => {
    assert.equal(normalizeAddress(`  ${ADDRESS}  `), ADDRESS)
    assert.equal(isWalletAddress(`  ${ADDRESS}  `), true)
    assert.equal(formatAddress(`  ${ADDRESS}  `), '0x1234...5678')
  })
})
