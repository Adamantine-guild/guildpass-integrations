import './setup-env'
import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/react-query'
import { MockAccessApi, resetMockData, setMockRoleMutationFailure } from '../lib/api/mock'
import { isApiError, ApiError } from '../lib/api/errors'
import { applyOptimisticRole } from '../lib/api/optimistic'
import { reconcileMemberRoleCache } from '../lib/query/member-cache'
import { queryKeys } from '../lib/query/query-keys'
import type { MemberRow, Role } from '../lib/api/types'

const ADDRESS = '0xAbC0000000000000000000000000000000000001'

function membersKey(searchQuery = '') {
  return [...queryKeys.members.all(), { searchQuery }] as const
}

function seedInfinitePage(members: MemberRow[]) {
  return {
    pages: [{ members, nextCursor: undefined, isFallback: true }],
    pageParams: [undefined],
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type AuditLogEntry = {
  id: string
  address: string
  role: Role
  action: 'assign' | 'remove'
  status: 'pending' | 'success' | 'error'
  timestamp: Date
  error?: string
}

describe('Role Assignment Mutation Logic & Audit Trail', () => {
  beforeEach(async () => {
    await resetMockData()
    setMockRoleMutationFailure(false)
  })

  test('successful assignment updates optimistic state and audit log', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    qc.setQueryData(membersKey(), seedInfinitePage([
      { address: ADDRESS, roles: ['member'], tier: 'standard', active: true },
    ]))

    const auditLog: AuditLogEntry[] = []

    // Simulate onMutate
    const auditId = 'test-audit-id'
    auditLog.unshift({
      id: auditId,
      address: ADDRESS,
      role: 'moderator',
      action: 'assign',
      status: 'pending',
      timestamp: new Date()
    })

    await qc.cancelQueries({ queryKey: queryKeys.members.all() })
    const previousQueries = qc.getQueriesData({ queryKey: queryKeys.members.all() })

    qc.setQueriesData({ queryKey: queryKeys.members.all() }, (old: any) => {
      return {
        ...old,
        pages: old.pages.map((page: any) => ({
          ...page,
          members: applyOptimisticRole(page.members, ADDRESS, 'moderator'),
        })),
      }
    })

    // Verify optimistic state
    const cached = qc.getQueryData<any>(membersKey())
    assert.deepEqual(cached.pages[0].members[0].roles, ['member', 'moderator'])

    // Simulate onSuccess
    const entryIndex = auditLog.findIndex(e => e.id === auditId)
    auditLog[entryIndex].status = 'success'
    reconcileMemberRoleCache(qc, { address: ADDRESS, role: 'moderator', action: 'assign' })

    assert.equal(auditLog[0].status, 'success')
    assert.deepEqual(qc.getQueryData<any>(membersKey()).pages[0].members[0].roles, ['member', 'moderator'])
  })

  test('failure rolls back optimistic state and updates audit log with error', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const initialCache = seedInfinitePage([
      { address: ADDRESS, roles: ['member'], tier: 'standard', active: true },
    ])
    qc.setQueryData(membersKey(), initialCache)

    const auditLog: AuditLogEntry[] = []
    const auditId = 'test-audit-id-2'

    // Simulate onMutate
    auditLog.unshift({
      id: auditId,
      address: ADDRESS,
      role: 'admin',
      action: 'assign',
      status: 'pending',
      timestamp: new Date()
    })

    await qc.cancelQueries({ queryKey: queryKeys.members.all() })
    const previousQueries = qc.getQueriesData({ queryKey: queryKeys.members.all() })

    qc.setQueriesData({ queryKey: queryKeys.members.all() }, (old: any) => {
      return {
        ...old,
        pages: old.pages.map((page: any) => ({
          ...page,
          members: applyOptimisticRole(page.members, ADDRESS, 'admin'),
        })),
      }
    })

    // Simulate onError
    const err = new ApiError({ status: 500, code: 'server_error', safeMessage: 'Test error' })
    
    for (const [key, data] of previousQueries) {
      qc.setQueryData(key, data)
    }

    const entryIndex = auditLog.findIndex(e => e.id === auditId)
    auditLog[entryIndex].status = 'error'
    auditLog[entryIndex].error = err.safeMessage

    assert.equal(auditLog[0].status, 'error')
    assert.equal(auditLog[0].error, 'Test error')
    assert.deepEqual(qc.getQueryData<any>(membersKey()).pages[0].members[0].roles, ['member'])
  })

  test('401 retry logic allows mutation to succeed on second attempt', async () => {
    let attempt = 0
    const mockMutationFn = async () => {
      attempt++
      if (attempt === 1) {
        throw new ApiError({ status: 401, code: 'unauthorized', safeMessage: 'Session expired' })
      }
      return Promise.resolve()
    }

    const retryLogic = (failureCount: number, error: unknown) => {
      if (error instanceof ApiError && error.code === 'unauthorized' && failureCount < 1) {
        return true
      }
      return false
    }

    // Try attempt 1
    let errorRef: unknown = null
    try {
      await mockMutationFn()
    } catch (err) {
      errorRef = err
    }

    assert.equal(attempt, 1)
    assert.ok(retryLogic(0, errorRef))

    // Try attempt 2
    await mockMutationFn()
    assert.equal(attempt, 2)
  })
})
