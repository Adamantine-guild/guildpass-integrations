import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import { applyOptimisticPolicy, applyOptimisticRole } from '../lib/api/optimistic'
import type { AccessPolicy, MemberRow } from '../lib/api/types'

test('applies a role assignment optimistically without losing the rollback snapshot', () => {
  const previousMembers: MemberRow[] = [
    {
      address: '0xabc',
      roles: ['member'],
      tier: 'standard',
      active: true,
    },
  ]

  const optimisticMembers = applyOptimisticRole(previousMembers, '0xabc', 'moderator')

  assert.deepEqual(optimisticMembers, [
    {
      address: '0xabc',
      roles: ['member', 'moderator'],
      tier: 'standard',
      active: true,
    },
  ])
  assert.deepEqual(previousMembers, [
    {
      address: '0xabc',
      roles: ['member'],
      tier: 'standard',
      active: true,
    },
  ])
})

test('rolls back an optimistic role assignment by restoring the previous members', () => {
  const previousMembers: MemberRow[] = [
    {
      address: '0xabc',
      roles: ['member'],
      tier: 'standard',
      active: true,
    },
  ]
  const optimisticMembers = applyOptimisticRole(previousMembers, '0xabc', 'admin')

  assert.notDeepEqual(optimisticMembers, previousMembers)
  assert.deepEqual(previousMembers, [
    {
      address: '0xabc',
      roles: ['member'],
      tier: 'standard',
      active: true,
    },
  ])
})

test('adds a missing member optimistically for a role assignment', () => {
  assert.deepEqual(applyOptimisticRole([], '0xdef', 'member'), [
    {
      address: '0xdef',
      roles: ['member'],
      tier: 'free',
      active: true,
    },
  ])
})

test('applies a policy edit optimistically without mutating the rollback snapshot', () => {
  const previousPolicies: AccessPolicy[] = [
    { resourceId: 'alpha', minTier: 'standard' },
    { resourceId: 'reports', minTier: 'pro' },
  ]

  const optimisticPolicies = applyOptimisticPolicy(previousPolicies, {
    resourceId: 'alpha',
    minTier: 'pro',
  })

  assert.deepEqual(optimisticPolicies, [
    { resourceId: 'alpha', minTier: 'pro' },
    { resourceId: 'reports', minTier: 'pro' },
  ])
  assert.deepEqual(previousPolicies, [
    { resourceId: 'alpha', minTier: 'standard' },
    { resourceId: 'reports', minTier: 'pro' },
  ])
})

test('rolls back an optimistic policy edit by restoring the previous policies', () => {
  const previousPolicies: AccessPolicy[] = [
    { resourceId: 'alpha', minTier: 'standard' },
  ]
  const optimisticPolicies = applyOptimisticPolicy(previousPolicies, {
    resourceId: 'alpha',
    minTier: 'pro',
  })

  assert.notDeepEqual(optimisticPolicies, previousPolicies)
  assert.deepEqual(previousPolicies, [
    { resourceId: 'alpha', minTier: 'standard' },
  ])
})
