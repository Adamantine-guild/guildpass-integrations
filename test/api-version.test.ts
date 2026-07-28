/**
 * Unit tests for the versioned API contract system:
 * - Semver parsing & compatibility
 * - Schema hash enforcement in check-types
 * - Mock /v1/meta endpoint
 * - EXPECTED_API_VERSION constant presence
 */

import assert from 'node:assert'
import { describe, it, before, after } from 'node:test'
import { checkVersionCompatibility } from '../lib/api/version'
import { setMockMetaVersion, MockAccessApi, resetMockData } from '../lib/api/mock'
import { EXPECTED_API_VERSION } from '../lib/api/types'

describe('checkVersionCompatibility', () => {
  it('returns compatible when major versions match (same version)', () => {
    const result = checkVersionCompatibility(EXPECTED_API_VERSION)
    assert.ok(result.compatible)
    if (result.compatible) {
      assert.equal(result.expectedVersion, EXPECTED_API_VERSION)
      assert.equal(result.backendVersion, EXPECTED_API_VERSION)
    }
  })

  it('returns compatible when major matches but minor differs', () => {
    const result = checkVersionCompatibility('1.5.0')
    assert.ok(result.compatible)
  })

  it('returns compatible when major matches but patch differs', () => {
    const result = checkVersionCompatibility('1.0.99')
    assert.ok(result.compatible)
  })

  it('returns compatible when backend has higher minor+patch', () => {
    const result = checkVersionCompatibility('1.99.99')
    assert.ok(result.compatible)
  })

  it('returns incompatible when major versions differ', () => {
    const result = checkVersionCompatibility('2.0.0')
    assert.ok(!result.compatible)
    if (!result.compatible) {
      assert.ok(result.reason.includes('Major version mismatch'))
    }
  })

  it('returns incompatible when backend version is unparseable', () => {
    const result = checkVersionCompatibility('dev-build')
    assert.ok(!result.compatible)
    if (!result.compatible) {
      assert.ok(result.reason.includes('unparseable'))
    }
  })

  it('returns incompatible when backend version is empty', () => {
    const result = checkVersionCompatibility('')
    assert.ok(!result.compatible)
  })

  it('returns incompatible for malformed semver strings', () => {
    // These are all strings that don't match the expected semver pattern
    // (strict x.y.z). Build metadata (+sha) is excluded because our parser
    // treats it as compatible (major equality check still applies).
    for (const bad of ['v1.0.0', '1.0', '1', 'abc', 'x.y.z']) {
      const result = checkVersionCompatibility(bad)
      assert.ok(!result.compatible, `"${bad}" should be incompatible but was compatible`)
    }
  })

  it('handles non-numeric major/minor/patch gracefully', () => {
    // "x.5.0" fails semver parse → incompatible
    const result = checkVersionCompatibility('x.5.0')
    assert.ok(!result.compatible)
  })
})

describe('EXPECTED_API_VERSION constant', () => {
  it('is defined and is a valid semver string', () => {
    assert.ok(typeof EXPECTED_API_VERSION === 'string')
    assert.ok(EXPECTED_API_VERSION.length > 0)
    assert.ok(/^\d+\.\d+\.\d+/.test(EXPECTED_API_VERSION))
  })
})

describe('Mock /v1/meta endpoint', () => {
  let api: MockAccessApi

  before(async () => {
    await resetMockData()
    api = new MockAccessApi('0x1234567890123456789012345678901234567890')
  })

  after(async () => {
    // Restore default mock meta version
    setMockMetaVersion(null)
    await resetMockData()
  })

  it('returns default version matching EXPECTED_API_VERSION', async () => {
    const meta = await api.getMeta()
    assert.equal(meta.version, EXPECTED_API_VERSION)
    assert.ok(meta.commit)
    assert.ok(typeof meta.uptime === 'number')
  })

  it('returns overridden version when set', async () => {
    setMockMetaVersion('2.0.0')
    const meta = await api.getMeta()
    assert.equal(meta.version, '2.0.0')

    // Reset
    setMockMetaVersion(null)
  })

  it('restores default version after clearing override', async () => {
    setMockMetaVersion('3.0.0')
    setMockMetaVersion(null)
    const meta = await api.getMeta()
    assert.equal(meta.version, EXPECTED_API_VERSION)
  })

  it('overridden version is per-instance / reads module-level override', async () => {
    setMockMetaVersion('2.5.1')
    const api2 = new MockAccessApi()
    const meta = await api2.getMeta()
    assert.equal(meta.version, '2.5.1')
    setMockMetaVersion(null)
  })
})

describe('Schema hash enforcement (sync-types.js)', () => {
  it('check-types passes when schema and version are in sync', async () => {
    // This is a smoke test: after running sync-types, check-types should pass
    const { execSync } = await import('node:child_process')
    try {
      execSync('npm run check-types', { cwd: process.cwd(), stdio: 'pipe', encoding: 'utf8' })
      assert.ok(true, 'check-types passed')
    } catch (err) {
      assert.fail(`check-types failed: ${(err as any).stdout}\n${(err as any).stderr}`)
    }
  })
})
