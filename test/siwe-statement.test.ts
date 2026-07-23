import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'

// lib/config.ts validates at module-import time, so each test sets the env
// and re-requires a fresh copy of the module (same pattern as features.test.ts).
function loadConfig() {
  return require('../lib/config')
}

function assertConfigError(fn: () => void, messagePattern: RegExp) {
  assert.throws(fn, (err: Error) => {
    assert.equal(err.name, 'ConfigError')
    assert.match(err.message, messagePattern)
    return true
  })
}

describe('NEXT_PUBLIC_SIWE_STATEMENT validation', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_MOCK_MODE
    delete process.env.NEXT_PUBLIC_DEMO_MODE
    delete process.env.NEXT_PUBLIC_CORE_API_URL
    delete process.env.NEXT_PUBLIC_SIWE_STATEMENT

    // Mock mode so live-mode URL requirements don't interfere
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'

    // Clear the require cache so we can re-import config.ts fresh each time
    delete require.cache[require.resolve('../lib/config')]
  })

  test('defaults to "Sign in to GuildPass Admin" when unset', () => {
    const { config } = loadConfig()
    assert.equal(config.siwe.statement, 'Sign in to GuildPass Admin')
  })

  test('accepts a valid custom statement', () => {
    process.env.NEXT_PUBLIC_SIWE_STATEMENT = 'Sign in to My DAO Dashboard'
    const { config } = loadConfig()
    assert.equal(config.siwe.statement, 'Sign in to My DAO Dashboard')
  })

  test('accepts a statement exactly at the 200-character cap', () => {
    const statement = 'a'.repeat(200)
    process.env.NEXT_PUBLIC_SIWE_STATEMENT = statement
    const { config } = loadConfig()
    assert.equal(config.siwe.statement, statement)
  })

  test('rejects a statement longer than 200 characters', () => {
    process.env.NEXT_PUBLIC_SIWE_STATEMENT = 'a'.repeat(201)
    assertConfigError(loadConfig, /at most 200 characters/)
  })

  test('rejects a statement containing a newline', () => {
    process.env.NEXT_PUBLIC_SIWE_STATEMENT = 'Sign in\nto GuildPass'
    assertConfigError(loadConfig, /single line/)
  })

  test('rejects a statement containing a carriage return', () => {
    process.env.NEXT_PUBLIC_SIWE_STATEMENT = 'Sign in\r\nto GuildPass'
    assertConfigError(loadConfig, /single line/)
  })

  test('rejects other control characters (tab)', () => {
    process.env.NEXT_PUBLIC_SIWE_STATEMENT = 'Sign in\tto GuildPass'
    assertConfigError(loadConfig, /single line/)
  })
})
