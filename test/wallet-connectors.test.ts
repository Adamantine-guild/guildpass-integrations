import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import './setup-env'
import {
  CONNECTOR_DOCS_URL,
  parseConnectorNames,
  SUPPORTED_CONNECTOR_NAMES,
  unsupportedConnectorMessage,
} from '../lib/wallet/connectors'
import { ConfigError } from '../lib/config'

describe('NEXT_PUBLIC_WALLET_CONNECTORS parsing', () => {
  test('defaults to ["injected"] when unset or empty', () => {
    assert.deepEqual(parseConnectorNames(undefined), ['injected'])
    assert.deepEqual(parseConnectorNames(''), ['injected'])
    assert.deepEqual(parseConnectorNames(' , '), ['injected'])
  })

  test('accepts the supported "injected" value (with whitespace)', () => {
    assert.deepEqual(parseConnectorNames('injected'), ['injected'])
    assert.deepEqual(parseConnectorNames(' injected , injected '), [
      'injected',
      'injected',
    ])
  })

  test('rejects an unsupported connector with a ConfigError', () => {
    assert.throws(
      () => parseConnectorNames('walletconnect'),
      (err: Error) => {
        assert.equal(err.name, 'ConfigError')
        assert.ok(err instanceof ConfigError)
        return true
      },
    )
  })

  test('error message names the offending value, lists supported values, and links docs', () => {
    try {
      parseConnectorNames('walletconnect')
      assert.fail('expected a ConfigError')
    } catch (err) {
      const message = (err as Error).message
      assert.match(message, /"walletconnect"/)
      assert.match(
        message,
        new RegExp(`Supported values: ${SUPPORTED_CONNECTOR_NAMES.join(', ')}`),
      )
      assert.ok(message.includes(CONNECTOR_DOCS_URL))
      assert.match(message, /lib\/wallet\/config\.ts/)
    }
  })

  test('rejects an unsupported value even when mixed with supported ones', () => {
    assert.throws(
      () => parseConnectorNames('injected,coinbase'),
      /unsupported connector "coinbase"/,
    )
  })

  test('unsupportedConnectorMessage interpolates the supported list', () => {
    const message = unsupportedConnectorMessage('safe')
    assert.match(message, /"safe"/)
    for (const name of SUPPORTED_CONNECTOR_NAMES) {
      assert.ok(message.includes(name))
    }
  })
})
