import './setup-env'
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  resetMockData,
  applyMockScenario,
  setMockRoleMutationFailure,
  setMockResourceFetchFailure,
  setMockResourceFetchDelay,
} from '../lib/api/mock'
import { getApi } from '../lib/api'
import { isApiError } from '../lib/api/errors'
import { adminRegistry, getAdminModule, getNavAdminModules } from '../lib/admin-modules'

describe('Mock Controls', () => {
  const TEST_ADDRESS = '0x1234567890123456789012345678901234567890'
  
  beforeEach(async () => {
    await resetMockData()
  })

  it('should reset mock data', async () => {
    const api = getApi(TEST_ADDRESS)
    // Modify some mock data
    const initialMembers = await api.listMembers()
    await api.assignRole(TEST_ADDRESS, 'admin')
    const updatedMembers = await api.listMembers()
    assert.notDeepStrictEqual(initialMembers, updatedMembers)

    // Reset and verify
    await resetMockData()
    const resetMembers = await api.listMembers()
    assert.deepStrictEqual(resetMembers, initialMembers)
  })

  it('should apply active-member scenario', async () => {
    await applyMockScenario('active-member', TEST_ADDRESS)
    const api = getApi(TEST_ADDRESS)
    const session = await api.getSession()
    assert.strictEqual(session.membership?.tier, 'standard')
    assert.strictEqual(session.membership?.active, true)
    assert.deepStrictEqual(session.roles, ['member'])
  })

  it('should apply expired-member scenario', async () => {
    await applyMockScenario('expired-member', TEST_ADDRESS)
    const api = getApi(TEST_ADDRESS)
    const session = await api.getSession()
    assert.strictEqual(session.membership?.active, false)
    assert.ok(session.membership?.expiresAt)
  })

  it('should apply denied-resource scenario', async () => {
    await applyMockScenario('denied-resource', TEST_ADDRESS)
    const api = getApi(TEST_ADDRESS)
    const session = await api.getSession()
    assert.strictEqual(session.membership?.tier, 'free')
    const policies = await api.listPolicies()
    const alphaPolicy = policies.find(p => p.resourceId === 'alpha')
    assert.strictEqual(alphaPolicy?.minTier, 'standard')
  })
})

describe('Multiple Roles scenario preset', () => {
  const TEST_ADDRESS = '0x1234567890123456789012345678901234567890'

  beforeEach(async () => {
    await resetMockData()
  })

  it('appears in the Developer Controls preset list alongside the existing five', () => {
    const source = readFileSync(
      path.resolve(__dirname, '..', '..', 'app', '[communitySlug]', 'developer', 'page.tsx'),
      'utf8',
    )
    assert.match(source, /id: 'multiple-roles'/)
    assert.match(source, /label: 'Multiple Roles'/)
    for (const id of [
      'active-member',
      'expired-member',
      'denied-resource',
      'admin-session-expired',
      'no-roles',
    ]) {
      assert.match(source, new RegExp(`id: '${id}'`))
    }
  })

  it('seeds at least two distinct roles', async () => {
    await applyMockScenario('multiple-roles', TEST_ADDRESS)
    const session = await getApi(TEST_ADDRESS).getSession()
    assert.ok(new Set(session.roles).size >= 2)
  })

  it('seeds the exact expected role set (admin, moderator, member)', async () => {
    await applyMockScenario('multiple-roles', TEST_ADDRESS)
    const session = await getApi(TEST_ADDRESS).getSession()
    assert.deepStrictEqual([...session.roles].sort(), ['admin', 'member', 'moderator'])
  })

  it('contains no duplicate roles', async () => {
    await applyMockScenario('multiple-roles', TEST_ADDRESS)
    const session = await getApi(TEST_ADDRESS).getSession()
    assert.strictEqual(session.roles.length, new Set(session.roles).size)
  })

  it('preserves an active pro-tier membership so role-aware UI renders normally', async () => {
    await applyMockScenario('multiple-roles', TEST_ADDRESS)
    const session = await getApi(TEST_ADDRESS).getSession()
    assert.strictEqual(session.membership?.tier, 'pro')
    assert.strictEqual(session.membership?.active, true)
  })

  it('switching from No Roles to Multiple Roles replaces the empty role set', async () => {
    await applyMockScenario('no-roles', TEST_ADDRESS)
    assert.deepStrictEqual((await getApi(TEST_ADDRESS).getSession()).roles, [])

    await applyMockScenario('multiple-roles', TEST_ADDRESS)
    const session = await getApi(TEST_ADDRESS).getSession()
    assert.deepStrictEqual([...session.roles].sort(), ['admin', 'member', 'moderator'])
  })

  it('switching away from Multiple Roles clears the extra roles', async () => {
    await applyMockScenario('multiple-roles', TEST_ADDRESS)
    await applyMockScenario('active-member', TEST_ADDRESS)
    const session = await getApi(TEST_ADDRESS).getSession()
    assert.deepStrictEqual(session.roles, ['member'])
  })

  it('leaves the other five presets behaving exactly as before', async () => {
    await applyMockScenario('admin-session-expired', TEST_ADDRESS)
    assert.deepStrictEqual((await getApi(TEST_ADDRESS).getSession()).roles, ['admin', 'member'])

    await applyMockScenario('no-roles', TEST_ADDRESS)
    assert.deepStrictEqual((await getApi(TEST_ADDRESS).getSession()).roles, [])

    await applyMockScenario('active-member', TEST_ADDRESS)
    assert.deepStrictEqual((await getApi(TEST_ADDRESS).getSession()).roles, ['member'])
  })

  it('role-aware nav logic receives the combined role list and unlocks admin nav items', async () => {
    await applyMockScenario('multiple-roles', TEST_ADDRESS)
    const session = await getApi(TEST_ADDRESS).getSession()

    const navItems = getNavAdminModules({ roles: session.roles, prefix: '' })
    assert.ok(navItems.length > 0)
    assert.ok(navItems.some((item) => item.id === 'overview'))

    const membersModule = getAdminModule('members')
    assert.ok(membersModule)
    assert.strictEqual(adminRegistry.hasRequiredRole(membersModule!, session.roles), true)
  })
})

describe('Simulated role mutation failure (#243)', () => {
  const TEST_ADDRESS = '0x1234567890123456789012345678901234567890'

  beforeEach(async () => {
    await resetMockData()
    setMockRoleMutationFailure(false)
  })

  it('assignRole and removeRole succeed normally while the toggle is off', async () => {
    const api = getApi(TEST_ADDRESS)
    await assert.doesNotReject(api.assignRole(TEST_ADDRESS, 'moderator'))
    await assert.doesNotReject(api.removeRole(TEST_ADDRESS, 'moderator'))
  })

  it('assignRole throws a generic (non-auth) failure once enabled', async () => {
    setMockRoleMutationFailure(true)
    const api = getApi(TEST_ADDRESS)
    await assert.rejects(
      api.assignRole(TEST_ADDRESS, 'moderator'),
      (err: unknown) => isApiError(err) && err.status === 500 && err.code === 'server_error',
    )
  })

  it('removeRole throws a generic (non-auth) failure once enabled', async () => {
    setMockRoleMutationFailure(true)
    const api = getApi(TEST_ADDRESS)
    await assert.rejects(
      api.removeRole(TEST_ADDRESS, 'member'),
      (err: unknown) => isApiError(err) && err.status === 500 && err.code === 'server_error',
    )
  })

  it('disabling the toggle restores normal behavior', async () => {
    setMockRoleMutationFailure(true)
    const api = getApi(TEST_ADDRESS)
    await assert.rejects(api.assignRole(TEST_ADDRESS, 'moderator'))

    setMockRoleMutationFailure(false)
    await assert.doesNotReject(api.assignRole(TEST_ADDRESS, 'moderator'))
  })

  it('resetMockData() clears the toggle', async () => {
    setMockRoleMutationFailure(true)
    await resetMockData()
    const api = getApi(TEST_ADDRESS)
    await assert.doesNotReject(api.assignRole(TEST_ADDRESS, 'moderator'))
  })
})

describe('Simulated resource fetch failure/delay injection', () => {
  const TEST_ADDRESS = '0x1234567890123456789012345678901234567890'

  beforeEach(async () => {
    await resetMockData()
    setMockResourceFetchFailure(false)
    setMockResourceFetchDelay(0)
  })

  it('getResource/getPolicy succeed normally while the toggle is off', async () => {
    const api = getApi(TEST_ADDRESS)
    const result = await api.getResource('alpha')
    assert.strictEqual(result.status, 'found')
    await assert.doesNotReject(api.getPolicy('alpha'))
  })

  it("setMockResourceFetchFailure('network') makes getResource resolve to a structured error result", async () => {
    setMockResourceFetchFailure('network')
    const api = getApi(TEST_ADDRESS)
    const result = await api.getResource('alpha')
    assert.strictEqual(result.status, 'error')
    assert.ok(result.status === 'error' && isApiError(result.error) && result.error.code === 'network_error' && result.error.retryable)
  })

  it("setMockResourceFetchFailure('server') makes getResource resolve to a structured 500 error result", async () => {
    setMockResourceFetchFailure('server')
    const api = getApi(TEST_ADDRESS)
    const result = await api.getResource('alpha')
    assert.strictEqual(result.status, 'error')
    assert.ok(
      result.status === 'error' &&
        isApiError(result.error) &&
        result.error.status === 500 &&
        result.error.code === 'server_error' &&
        result.error.retryable,
    )
  })

  it("setMockResourceFetchFailure('network') makes getPolicy throw (matching LiveAccessApi's throwing contract)", async () => {
    setMockResourceFetchFailure('network')
    const api = getApi(TEST_ADDRESS)
    await assert.rejects(
      api.getPolicy('alpha'),
      (err: unknown) => isApiError(err) && err.code === 'network_error' && err.retryable,
    )
  })

  it('setMockResourceFetchDelay() delays resolution by at least the configured amount', async () => {
    setMockResourceFetchDelay(40)
    const api = getApi(TEST_ADDRESS)
    const start = Date.now()
    await api.getResource('alpha')
    assert.ok(Date.now() - start >= 40)
  })

  it('resetMockData() clears both the failure mode and the delay', async () => {
    setMockResourceFetchFailure('server')
    setMockResourceFetchDelay(500)
    await resetMockData()
    const api = getApi(TEST_ADDRESS)
    const start = Date.now()
    const result = await api.getResource('alpha')
    assert.strictEqual(result.status, 'found')
    assert.ok(Date.now() - start < 500)
  })
})