import './setup-env'
import { describe, test, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import nextConfig from '../next.config.mjs'
import {
  loadAuthSessionIncludingExpired,
  storeAuthSession,
} from '../lib/session'

const SESSION_KEY = 'guildpass:siwe-session'

class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  clear(): void {
    this.store.clear()
  }
}

beforeEach(() => {
  const storage = new MemoryStorage()
  ;(globalThis as any).window = {
    sessionStorage: storage,
    dispatchEvent: () => true,
  }
})

afterEach(() => {
  delete (globalThis as any).window
})

describe('SIWE Threat Model & Security Hardening Tests', () => {
  test('siwe-threat-model.md document exists and covers core trust boundaries', () => {
    const docPath = path.join(process.cwd(), 'docs', 'security', 'siwe-threat-model.md')
    assert.ok(fs.existsSync(docPath), 'docs/security/siwe-threat-model.md must exist')

    const content = fs.readFileSync(docPath, 'utf8')
    assert.ok(content.includes('Trust Boundary 1: Client Browser Runtime'), 'Must detail Trust Boundary 1')
    assert.ok(content.includes('Trust Boundary 2: Next.js Integration Gateway'), 'Must detail Trust Boundary 2')
    assert.ok(content.includes('Trust Boundary 3: External Backend'), 'Must detail Trust Boundary 3')
    assert.ok(content.includes('TM-01'), 'Must contain TM-01 vulnerability entry')
    assert.ok(content.includes('Content-Security-Policy'), 'Must discuss CSP')
  })

  test('next.config.mjs returns expected security headers', async () => {
    assert.ok(typeof nextConfig.headers === 'function', 'headers must be a function')
    const headerConfigs = await nextConfig.headers()
    assert.ok(Array.isArray(headerConfigs), 'headers must return an array')
    assert.ok(headerConfigs.length > 0, 'headers array must not be empty')

    const allRoutesHeader = headerConfigs.find((h: any) => h.source === '/(.*)')
    assert.ok(allRoutesHeader, 'Must contain a header rule for /(.*)')

    const headersMap = new Map(
      allRoutesHeader.headers.map((h: { key: string; value: string }) => [h.key, h.value]),
    )

    assert.ok(headersMap.has('Content-Security-Policy'), 'Must set Content-Security-Policy')
    const csp = headersMap.get('Content-Security-Policy')!
    assert.ok(csp.includes("default-src 'self'"), "CSP must include default-src 'self'")
    assert.ok(csp.includes("frame-ancestors 'none'"), "CSP must include frame-ancestors 'none'")
    assert.ok(csp.includes("object-src 'none'"), "CSP must include object-src 'none'")

    assert.equal(headersMap.get('X-Frame-Options'), 'DENY')
    assert.equal(headersMap.get('X-Content-Type-Options'), 'nosniff')
    assert.equal(headersMap.get('Referrer-Policy'), 'strict-origin-when-cross-origin')
    assert.equal(headersMap.get('Strict-Transport-Security'), 'max-age=63072000; includeSubDomains; preload')
    assert.equal(headersMap.get('X-XSS-Protection'), '0')
  })

  test('loadAuthSessionIncludingExpired rejects non-string or malformed token/address/expiresAt', () => {
    // Non-string token
    ;(globalThis as any).window.sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ token: 12345, address: '0x123', expiresAt: '2026-12-31T00:00:00Z' }),
    )
    assert.equal(loadAuthSessionIncludingExpired(), null)

    // Empty whitespace address
    ;(globalThis as any).window.sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ token: 'jwt-abc', address: '  ', expiresAt: '2026-12-31T00:00:00Z' }),
    )
    assert.equal(loadAuthSessionIncludingExpired(), null)

    // Valid session
    const valid = { token: 'jwt-abc', address: '0x123', expiresAt: '2026-12-31T00:00:00Z' }
    ;(globalThis as any).window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(valid))
    const loaded = loadAuthSessionIncludingExpired()
    assert.ok(loaded !== null)
    assert.equal(loaded.token, 'jwt-abc')
    assert.equal(loaded.address, '0x123')
  })
})
