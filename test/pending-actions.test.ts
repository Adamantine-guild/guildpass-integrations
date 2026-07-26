import './setup-env.ts'
import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { MockAccessApi, resetMockData } from '../lib/api/mock.ts'
import type { Role } from '../lib/api/types.ts'

const ADDRESS = '0x0000000000000000000000000000000000000001'

describe('Pending Actions & Multi-Admin Approval Workflow', () => {
  beforeEach(async () => {
    await resetMockData()
  })

  test('direct execution when threshold is 1', async () => {
    const api = new MockAccessApi('guildpass-demo')
    
    // Set threshold to 1
    await api.updateApprovalConfig({ assignRole: 1, removeRole: 1, updatePolicy: 1 })
    
    const result = await api.assignRole(ADDRESS, 'admin' as Role)
    assert.equal(result.status, 'executed')
    
    const pending = await api.getPendingActions()
    assert.equal(pending.length, 0)
  })

  test('creates pending action when threshold > 1', async () => {
    const api = new MockAccessApi('guildpass-demo')
    
    // Set threshold to 2
    await api.updateApprovalConfig({ assignRole: 2, removeRole: 1, updatePolicy: 1 })
    
    const result = await api.assignRole(ADDRESS, 'admin' as Role)
    assert.equal(result.status, 'pending')
    assert.ok(result.pendingActionId)
    
    const pending = await api.getPendingActions()
    assert.equal(pending.length, 1)
    assert.equal(pending[0].id, result.pendingActionId)
    assert.equal(pending[0].type, 'assignRole')
    assert.equal(pending[0].status, 'pending')
    assert.equal(pending[0].requiredApprovals, 2)
  })

  test('approval workflow executes mutation upon reaching required count', async () => {
    const api = new MockAccessApi('guildpass-demo')
    await api.updateApprovalConfig({ assignRole: 2, removeRole: 1, updatePolicy: 1 })
    
    const result = await api.assignRole(ADDRESS, 'admin' as Role)
    assert.equal(result.status, 'pending')
    
    const actionId = result.pendingActionId!
    
    // Approve action (simulating second approval)
    await api.approveAction(actionId)
    
    const pending = await api.getPendingActions()
    assert.equal(pending.length, 1)
    assert.equal(pending[0].status, 'executed')
    
    // Verify member actually got the role
    const membersRes = await api.listMembers({})
    const members = Array.isArray(membersRes) ? membersRes : membersRes.members
    const targetMember = members.find(m => m.address === ADDRESS)
    assert.ok(targetMember)
    assert.ok(targetMember.roles.includes('admin'))
  })

  test('rejection workflow prevents execution', async () => {
    const api = new MockAccessApi('guildpass-demo')
    await api.updateApprovalConfig({ assignRole: 2, removeRole: 1, updatePolicy: 1 })
    
    const result = await api.assignRole(ADDRESS, 'admin' as Role)
    assert.equal(result.status, 'pending')
    
    const actionId = result.pendingActionId!
    
    // Reject action
    await api.rejectAction(actionId)
    
    const pending = await api.getPendingActions()
    assert.equal(pending.length, 1)
    assert.equal(pending[0].status, 'rejected')
    
    // Verify member did NOT get the role
    const membersRes = await api.listMembers({})
    const members = Array.isArray(membersRes) ? membersRes : membersRes.members
    const targetMember = members.find(m => m.address === ADDRESS)
    assert.ok(targetMember)
    assert.ok(!targetMember.roles.includes('admin'))
  })
})
