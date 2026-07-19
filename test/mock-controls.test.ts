import './setup-env'
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { resetMockData, applyMockScenario } from '../lib/api/mock'
import { getApi } from '../lib/api'

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
    assert.deepStrictEqual(session.capabilities, [])
  })

  it('should apply expired-member scenario', async () => {
    await applyMockScenario('expired-member', TEST_ADDRESS)
    const api = getApi(TEST_ADDRESS)
    const session = await api.getSession()
    assert.strictEqual(session.membership?.active, false)
    assert.ok(session.membership?.expiresAt)
  })

  it('should keep No Roles denied for every admin capability', async () => {
    applyMockScenario('no-roles', TEST_ADDRESS)
    const api = getApi(TEST_ADDRESS)
    const session = await api.getSession()
    assert.deepStrictEqual(session.roles, [])
    assert.deepStrictEqual(session.capabilities, [])
  })

  it('should apply partial-capability-admin scenario', async () => {
    applyMockScenario('partial-capability-admin', TEST_ADDRESS)
    const api = getApi(TEST_ADDRESS)
    const session = await api.getSession()
    assert.deepStrictEqual(session.capabilities, ['assign_roles', 'view_events'])
    assert.equal(session.capabilities?.includes('assign_roles'), true)
    assert.equal(session.capabilities?.includes('edit_settings'), false)
    assert.equal(session.capabilities?.includes('edit_policies'), false)
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