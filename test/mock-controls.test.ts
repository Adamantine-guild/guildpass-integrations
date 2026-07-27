import './setup-env'
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  resetMockData,
  applyMockScenario,
  setMockRoleMutationFailure,
  setMockResourceFetchFailure,
  setMockResourceFetchDelay,
} from '../lib/api/mock'
import { getApi } from '../lib/api'
import { isApiError } from '../lib/api/errors'

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