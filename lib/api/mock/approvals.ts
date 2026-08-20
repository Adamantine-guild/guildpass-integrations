/**
 * lib/api/mock/approvals.ts
 *
 * Admin mutation domain of the mock API: role/policy mutations with the
 * multi-approval pending-action flow. Extracted from lib/api/mock.ts.
 */
import { PolicyValidationError, validatePolicy } from '../../validation/policy'
import { ApiError } from '../errors'
import {
  getMockRoleMutationFailure,
  throwMockRoleMutationFailure,
} from './controls'
import { MOCK_SESSION_STATE, throwMockUnauthorized } from './session'
import {
  ensureAddress,
  getCommunityState,
  initPromise,
  schedulePersist,
  type MockApiContext,
} from './state'
import type {
  AccessPolicy,
  ApprovalConfig,
  PendingAction,
  PendingActionPayload,
  PendingActionType,
  Role,
} from '../types'

export async function mockGetPendingActions(ctx: MockApiContext): Promise<PendingAction[]> {
  await initPromise
  return getCommunityState(ctx.communityId).pendingActions
}

export async function mockApproveAction(ctx: MockApiContext, id: string): Promise<void> {
  await initPromise
  const state = getCommunityState(ctx.communityId)
  const action = state.pendingActions.find(a => a.id === id)
  if (!action || action.status !== 'pending') return

  const adminAddr = ctx.address || '0x0000000000000000000000000000000000000001'
  if (!action.currentApprovals.includes(adminAddr)) {
    action.currentApprovals.push(adminAddr)
  }

  if (action.currentApprovals.length >= action.requiredApprovals) {
    if (action.type === 'assignRole') {
      const data = ensureAddress(action.payload.address!, ctx.communityId)
      if (data && !data.roles.includes(action.payload.role! as Role)) data.roles.push(action.payload.role! as Role)
    } else if (action.type === 'removeRole') {
      const data = state.memberStore[action.payload.address!]
      if (data) data.roles = data.roles.filter(r => r !== action.payload.role!)
    } else if (action.type === 'updatePolicy') {
      const result = validatePolicy(action.payload.policy!)
      if (result.valid) {
         const idx = state.policies.findIndex(p => p.resourceId === result.value.resourceId)
         const updatedPolicy = { ...result.value, updatedAt: new Date().toISOString() }
         if (idx >= 0) state.policies[idx] = updatedPolicy
         else state.policies.push(updatedPolicy)
      }
    }
    action.status = 'executed'
  }
  schedulePersist()
}

export async function mockRejectAction(ctx: MockApiContext, id: string): Promise<void> {
  await initPromise
  const state = getCommunityState(ctx.communityId)
  const action = state.pendingActions.find(a => a.id === id)
  if (action && action.status === 'pending') {
    action.status = 'rejected'
    schedulePersist()
  }
}

export async function mockUpdateApprovalConfig(ctx: MockApiContext, config: ApprovalConfig): Promise<void> {
  await initPromise
  const state = getCommunityState(ctx.communityId)
  ;(state.community as any).approvalConfig = config
  schedulePersist()
}

function checkApproval(
  ctx: MockApiContext,
  type: PendingActionType,
  payload: PendingActionPayload,
): { status: 'executed' | 'pending'; pendingActionId?: string } {
  const state = getCommunityState(ctx.communityId)
  const config = (state.community as any).approvalConfig
  const required = config ? config[type] || 1 : 1

  if (required > 1) {
    const pendingActionId = `pa_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    const adminAddr = ctx.address || '0x0000000000000000000000000000000000000001'
    state.pendingActions.push({
      id: pendingActionId,
      type,
      payload,
      proposer: adminAddr,
      requiredApprovals: required,
      currentApprovals: [adminAddr],
      status: 'pending',
      createdAt: new Date().toISOString()
    })
    schedulePersist()
    return { status: 'pending', pendingActionId }
  }
  return { status: 'executed' }
}

export async function mockAssignRole(
  ctx: MockApiContext,
  address: string,
  role: Role,
): Promise<{ status: 'executed' | 'pending'; pendingActionId?: string }> {
  await initPromise
  if (MOCK_SESSION_STATE === 'expired') throwMockUnauthorized()
  if (getMockRoleMutationFailure()) throwMockRoleMutationFailure()

  const check = checkApproval(ctx, 'assignRole', { address, role })
  if (check.status === 'pending') return check

  const data = ensureAddress(address, ctx.communityId)
  if (!data) return { status: 'executed' }
  if (!data.roles.includes(role)) data.roles.push(role)
  schedulePersist()
  return { status: 'executed' }
}

export async function mockRemoveRole(
  ctx: MockApiContext,
  address: string,
  role: Role,
): Promise<{ status: 'executed' | 'pending'; pendingActionId?: string }> {
  await initPromise
  if (MOCK_SESSION_STATE === 'expired') throwMockUnauthorized()
  if (getMockRoleMutationFailure()) throwMockRoleMutationFailure()

  const check = checkApproval(ctx, 'removeRole', { address, role })
  if (check.status === 'pending') return check

  const state = getCommunityState(ctx.communityId)
  const data = state.memberStore[address]
  if (!data) return { status: 'executed' }
  data.roles = data.roles.filter((r) => r !== role)
  schedulePersist()
  return { status: 'executed' }
}

export async function mockUpdatePolicy(
  ctx: MockApiContext,
  policy: AccessPolicy,
): Promise<{ status: 'executed' | 'pending'; pendingActionId?: string }> {
  await initPromise
  if (MOCK_SESSION_STATE === 'expired') throwMockUnauthorized()
  const result = validatePolicy(policy)

  if (!result.valid) {
    throw new PolicyValidationError(result.errors)
  }

  const state = getCommunityState(ctx.communityId)
  const idx = state.policies.findIndex((p) => p.resourceId === result.value.resourceId)

  // Optimistic concurrency control: check if policy was modified since load
  if (idx >= 0 && policy.updatedAt) {
    const existingPolicy = state.policies[idx]
    if (existingPolicy.updatedAt && existingPolicy.updatedAt !== policy.updatedAt) {
      throw new ApiError({
        status: 409,
        code: 'conflict',
        safeMessage: 'This policy was modified by another user. Please reload and try again.',
        details: {
          currentUpdatedAt: existingPolicy.updatedAt,
          providedUpdatedAt: policy.updatedAt,
        },
      })
    }
  }

  const check = checkApproval(ctx, 'updatePolicy', { policy })
  if (check.status === 'pending') return check

  // Update policy with new timestamp
  const updatedPolicy = {
    ...result.value,
    updatedAt: new Date().toISOString(),
  }

  if (idx >= 0) state.policies[idx] = updatedPolicy
  else state.policies.push(updatedPolicy)
  schedulePersist()
  return { status: 'executed' }
}
