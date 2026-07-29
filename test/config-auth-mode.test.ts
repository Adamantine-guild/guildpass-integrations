import './setup-env'
import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import { buildAppConfig } from '../lib/config'

/**
 * Focused unit tests for NEXT_PUBLIC_AUTH_MODE parsing (dual-mode readiness
 * for the httpOnly-cookie SIWE migration — see
 * docs/http-only-cookie-migration.md).
 *
 * `buildAppConfig` takes an explicit EnvSource, so these tests call it
 * directly with synthetic env objects rather than mutating process.env /
 * clearing the require cache.
 */

const MOCK_BASE = { NEXT_PUBLIC_MOCK_MODE: 'true' }

describe('NEXT_PUBLIC_AUTH_MODE (#dual-mode-cookie-readiness)', () => {
  test('defaults to bearer when unset', () => {
    const config = buildAppConfig({ ...MOCK_BASE })
    assert.equal(config.authMode, 'bearer')
  })

  test('defaults to bearer when the var is an empty string', () => {
    const config = buildAppConfig({ ...MOCK_BASE, NEXT_PUBLIC_AUTH_MODE: '' })
    assert.equal(config.authMode, 'bearer')
  })

  test('is cookie only for the exact literal "cookie"', () => {
    const config = buildAppConfig({ ...MOCK_BASE, NEXT_PUBLIC_AUTH_MODE: 'cookie' })
    assert.equal(config.authMode, 'cookie')
  })

  test('falls back to bearer for any other value — never throws, never silently becomes cookie', () => {
    for (const value of ['COOKIE', 'Cookie', ' cookie', 'cookie ', 'bearer-ish', 'true', '1']) {
      const config = buildAppConfig({ ...MOCK_BASE, NEXT_PUBLIC_AUTH_MODE: value })
      assert.equal(config.authMode, 'bearer', `expected bearer fallback for ${JSON.stringify(value)}`)
    }
  })

  test('is independent of apiMode — cookie auth mode works in both mock and live api mode', () => {
    const mockCookie = buildAppConfig({
      NEXT_PUBLIC_MOCK_MODE: 'true',
      NEXT_PUBLIC_AUTH_MODE: 'cookie',
    })
    assert.equal(mockCookie.apiMode, 'mock')
    assert.equal(mockCookie.authMode, 'cookie')

    const liveCookie = buildAppConfig({
      NEXT_PUBLIC_CORE_API_URL: 'http://localhost:4000',
      NEXT_PUBLIC_AUTH_MODE: 'cookie',
    })
    assert.equal(liveCookie.apiMode, 'live')
    assert.equal(liveCookie.authMode, 'cookie')
  })

  test('the frozen config object exposes authMode as a top-level field', () => {
    const config = buildAppConfig({ ...MOCK_BASE, NEXT_PUBLIC_AUTH_MODE: 'cookie' })
    assert.ok(Object.isFrozen(config))
    assert.equal(config.authMode, 'cookie')
  })
})
