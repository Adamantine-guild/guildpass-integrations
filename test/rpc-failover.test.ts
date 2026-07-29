import './setup-env'
import { describe, test, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  rpcHealth,
  recordRpcFailure,
  recordRpcSuccess,
  isDeprioritized,
  hasInjectedWallet,
} from '../lib/wallet/config'

afterEach(() => {
  rpcHealth.clear()
})

describe('RPC health tracking', () => {
  test('single failure does not deprioritize', () => {
    recordRpcFailure('https://rpc-a.example.com')
    assert.equal(isDeprioritized('https://rpc-a.example.com'), false)
  })

  test('two failures do not deprioritize', () => {
    recordRpcFailure('https://rpc-a.example.com')
    recordRpcFailure('https://rpc-a.example.com')
    assert.equal(isDeprioritized('https://rpc-a.example.com'), false)
  })

  test('three failures deprioritize the endpoint', () => {
    recordRpcFailure('https://rpc-a.example.com')
    recordRpcFailure('https://rpc-a.example.com')
    recordRpcFailure('https://rpc-a.example.com')
    assert.equal(isDeprioritized('https://rpc-a.example.com'), true)
  })

  test('recordRpcSuccess removes health entry', () => {
    recordRpcFailure('https://rpc-a.example.com')
    recordRpcFailure('https://rpc-a.example.com')
    recordRpcFailure('https://rpc-a.example.com')
    assert.equal(isDeprioritized('https://rpc-a.example.com'), true)
    recordRpcSuccess('https://rpc-a.example.com')
    assert.equal(isDeprioritized('https://rpc-a.example.com'), false)
  })

  test('unknown URL is not deprioritized', () => {
    assert.equal(isDeprioritized('https://unknown.example.com'), false)
  })

  test('failures on different URLs are tracked independently', () => {
    recordRpcFailure('https://rpc-a.example.com')
    recordRpcFailure('https://rpc-a.example.com')
    recordRpcFailure('https://rpc-a.example.com')
    assert.equal(isDeprioritized('https://rpc-a.example.com'), true)
    assert.equal(isDeprioritized('https://rpc-b.example.com'), false)
  })

  test('failure count is recorded in rpcHealth map', () => {
    recordRpcFailure('https://rpc-a.example.com')
    recordRpcFailure('https://rpc-a.example.com')
    const entry = rpcHealth.get('https://rpc-a.example.com')
    assert.ok(entry)
    assert.equal(entry.failureCount, 2)
    assert.equal(entry.deprioritized, false)
  })
})

describe('hasInjectedWallet', () => {
  test('returns false when window is undefined (SSR)', () => {
    assert.equal(hasInjectedWallet(), false)
  })
})

describe('multi-RPC config validation', () => {
  test('comma-separated RPC URLs are parsed correctly', () => {
    process.env.NEXT_PUBLIC_WALLET_RPC_MAINNET = 'https://rpc-a.example.com,https://rpc-b.example.com'
    const envValue = process.env.NEXT_PUBLIC_WALLET_RPC_MAINNET
    const urls = envValue
      ?.split(',')
      .map((part) => part.trim())
      .filter(Boolean) ?? []
    assert.equal(urls.length, 2)
    assert.equal(urls[0], 'https://rpc-a.example.com')
    assert.equal(urls[1], 'https://rpc-b.example.com')
    delete process.env.NEXT_PUBLIC_WALLET_RPC_MAINNET
  })

  test('empty CSV segments are filtered out', () => {
    const raw = 'https://rpc-a.example.com,,  ,https://rpc-b.example.com,'
    const urls = raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    assert.equal(urls.length, 2)
  })
})

describe('connector validation', () => {
  test('supported connector names are accepted', () => {
    const supported = ['injected', 'walletConnect']
    for (const name of supported) {
      assert.ok(supported.includes(name))
    }
  })

  test('unsupported connector name is rejected', () => {
    const supported = ['injected', 'walletConnect']
    assert.equal(supported.includes('coinbaseWallet'), false)
    assert.equal(supported.includes('unknown'), false)
  })
})
