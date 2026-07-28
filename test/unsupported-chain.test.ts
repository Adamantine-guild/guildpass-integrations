import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import './setup-env'
import { chainLabel, manualSwitchInstruction } from '../lib/wallet/chains'

// We test the pure utility functions from chains.ts (no wagmi/React deps).
// The React hook (useUnsupportedChain) and banner component are tested via
// integration/e2e tests — see playwright.config.ts.
//
// chainLabel() is pure — it falls back to a hard-coded known-chain lookup
// table for non-supported IDs and "Chain {id}" for truly unknown ones.
// walletConfig.chains is resolved at import time from env vars which are
// set to mock-safe defaults by setup-env.ts.

describe('chainLabel()', () => {
  test('returns a non-empty string for a supported chain ID (1 = mainnet)', () => {
    const label = chainLabel(1)
    assert.equal(typeof label, 'string')
    assert.ok(label.length > 0)
  })

  test('returns "Polygon" for chain ID 137', () => {
    assert.equal(chainLabel(137), 'Polygon')
  })

  test('returns "Chain {id}" for a completely unknown chain', () => {
    assert.equal(chainLabel(999), 'Chain 999')
  })
})

describe('manualSwitchInstruction()', () => {
  test('returns a sentence naming the target chain', () => {
    const instruction = manualSwitchInstruction('Ethereum')
    assert.match(instruction, /Ethereum/)
    assert.match(instruction, /switch/)
    assert.match(instruction, /manually/)
  })
})
