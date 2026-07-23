import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import { applyOptimisticPolicy, applyOptimisticRole, applyOptimisticRemoveRole } from '../lib/api/optimistic'
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

// ── Role removal tests ──────────────────────────────────────────────────────

test('removes a role optimistically and leaves other roles intact', () => {
  const previousMembers: MemberRow[] = [
    {
      address: '0xabc',
      roles: ['member', 'moderator', 'admin'],
      tier: 'standard',
      active: true,
    },
  ]

  const optimisticMembers = applyOptimisticRemoveRole(previousMembers, '0xabc', 'moderator')

  assert.deepEqual(optimisticMembers, [
    {
      address: '0xabc',
      roles: ['member', 'admin'],
      tier: 'standard',
      active: true,
    },
  ])
  // previousMembers must be preserved unchanged for rollback
  assert.deepEqual(previousMembers, [
    {
      address: '0xabc',
      roles: ['member', 'moderator', 'admin'],
      tier: 'standard',
      active: true,
    },
  ])
})

test('role removal is a no-op for addresses not in the list', () => {
  const previousMembers: MemberRow[] = [
    {
      address: '0xabc',
      roles: ['member'],
      tier: 'free',
      active: true,
    },
  ]

  const optimisticMembers = applyOptimisticRemoveRole(previousMembers, '0xdef', 'admin')

  assert.deepEqual(optimisticMembers, previousMembers)
})

test('role removal on empty members array returns empty array', () => {
  const result = applyOptimisticRemoveRole([], '0xabc', 'member')
  assert.deepEqual(result, [])
})

test('assigning an already-present role does not create duplicates (idempotent)', () => {
  const previousMembers: MemberRow[] = [
    {
      address: '0xabc',
      roles: ['member', 'admin'],
      tier: 'standard',
      active: true,
    },
  ]

  const optimisticMembers = applyOptimisticRole(previousMembers, '0xabc', 'admin')

  assert.deepEqual(optimisticMembers, previousMembers)
})

test('removeRoleMutation restores previous state on rollback via applyOptimisticRemoveRole', () => {
  const previousMembers: MemberRow[] = [
    {
      address: '0xabc',
      roles: ['member', 'moderator'],
      tier: 'pro',
      active: true,
    },
  ]
  const optimisticMembers = applyOptimisticRemoveRole(previousMembers, '0xabc', 'member')

  // Simulate rollback by restoring previousMembers on error
  const rolledBack = previousMembers
  assert.deepEqual(rolledBack, [
    {
      address: '0xabc',
      roles: ['member', 'moderator'],
      tier: 'pro',
      active: true,
    },
  ])
  // Optimistic should differ from previous (role removed)
  assert.notDeepEqual(optimisticMembers, previousMembers)
})
