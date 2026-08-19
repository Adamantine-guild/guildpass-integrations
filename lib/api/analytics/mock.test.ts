/**
 * lib/api/analytics/mock.test.ts
 *
 * Tests for analytics mock data type safety and structure.
 *
 * Acceptance criteria:
 * - MOCK_ANALYTICS_SUMMARY has explicit resourceAccess field
 * - resourceAccess field is not null/undefined
 * - Type checking: resource access matches AnalyticsSummary type
 * - Accessor functions return same data as direct field access
 * - Accessor functions have proper return types (not any/unknown)
 * - The mock compiles and satisfies AnalyticsSummary type
 */

import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  MOCK_ANALYTICS_SUMMARY,
  getResourceAccess,
  getMemberGrowth,
  getMockAnalyticsSummary,
} from './mock'
import type { AnalyticsSummary, ResourceAccessCount } from './types'

// ── Mock structure tests ─────────────────────────────────────────────────────

test('MOCK_ANALYTICS_SUMMARY has resourceAccess field', () => {
  assert.ok(
    MOCK_ANALYTICS_SUMMARY.resourceAccess !== undefined,
    'resourceAccess must be defined',
  )
  assert.ok(
    MOCK_ANALYTICS_SUMMARY.resourceAccess !== null,
    'resourceAccess must not be null',
  )
})

test('MOCK_ANALYTICS_SUMMARY.resourceAccess is an array', () => {
  assert.ok(
    Array.isArray(MOCK_ANALYTICS_SUMMARY.resourceAccess),
    'resourceAccess must be an array',
  )
})

test('MOCK_ANALYTICS_SUMMARY.resourceAccess contains objects with required fields', () => {
  const { resourceAccess } = MOCK_ANALYTICS_SUMMARY

  assert.ok(resourceAccess.length > 0, 'resourceAccess should have entries')

  resourceAccess.forEach((item, index) => {
    assert.ok(
      typeof item.resourceId === 'string',
      `resourceAccess[${index}].resourceId must be a string`,
    )
    assert.ok(
      typeof item.resourceTitle === 'string',
      `resourceAccess[${index}].resourceTitle must be a string`,
    )
    assert.ok(
      typeof item.accessCount === 'number',
      `resourceAccess[${index}].accessCount must be a number`,
    )
    assert.ok(
      typeof item.deniedCount === 'number',
      `resourceAccess[${index}].deniedCount must be a number`,
    )
  })
})

test('MOCK_ANALYTICS_SUMMARY has all required AnalyticsSummary fields', () => {
  const summary = MOCK_ANALYTICS_SUMMARY

  assert.ok(
    typeof summary.totalMembers === 'number',
    'totalMembers must be a number',
  )
  assert.ok(
    typeof summary.activeMembers === 'number',
    'activeMembers must be a number',
  )
  assert.ok(
    Array.isArray(summary.memberGrowth),
    'memberGrowth must be an array',
  )
  assert.ok(
    typeof summary.generatedAt === 'string',
    'generatedAt must be a string',
  )
})

test('MOCK_ANALYTICS_SUMMARY.memberGrowth contains valid daily data', () => {
  const { memberGrowth } = MOCK_ANALYTICS_SUMMARY

  assert.ok(memberGrowth.length > 0, 'memberGrowth should have data points')

  memberGrowth.forEach((point, index) => {
    assert.ok(
      typeof point.date === 'string',
      `memberGrowth[${index}].date must be a string`,
    )
    assert.ok(
      typeof point.newMembers === 'number',
      `memberGrowth[${index}].newMembers must be a number`,
    )
    assert.ok(
      typeof point.totalMembers === 'number',
      `memberGrowth[${index}].totalMembers must be a number`,
    )
    // Verify dates are in ISO format (YYYY-MM-DD)
    assert.match(
      point.date,
      /^\d{4}-\d{2}-\d{2}$/,
      `memberGrowth[${index}].date must be in YYYY-MM-DD format`,
    )
  })
})

// ── Accessor function tests ──────────────────────────────────────────────────

test('getResourceAccess() returns same data as direct field access', () => {
  const directAccess = MOCK_ANALYTICS_SUMMARY.resourceAccess
  const accessorResult = getResourceAccess()

  assert.deepEqual(
    accessorResult,
    directAccess,
    'getResourceAccess() must return same data as MOCK_ANALYTICS_SUMMARY.resourceAccess',
  )
})

test('getResourceAccess() returns type-safe ResourceAccessCount[]', () => {
  const result = getResourceAccess()

  assert.ok(Array.isArray(result), 'getResourceAccess() must return an array')
  result.forEach((item) => {
    assert.ok(
      typeof item.resourceId === 'string' &&
      typeof item.resourceTitle === 'string' &&
      typeof item.accessCount === 'number' &&
      typeof item.deniedCount === 'number',
      'Each item must have proper ResourceAccessCount shape',
    )
  })
})

test('getMemberGrowth() returns same data as direct field access', () => {
  const directGrowth = MOCK_ANALYTICS_SUMMARY.memberGrowth
  const accessorResult = getMemberGrowth()

  assert.deepEqual(
    accessorResult,
    directGrowth,
    'getMemberGrowth() must return same data as MOCK_ANALYTICS_SUMMARY.memberGrowth',
  )
})

test('getMemberGrowth() returns array of MemberGrowthDataPoint', () => {
  const result = getMemberGrowth()

  assert.ok(Array.isArray(result), 'getMemberGrowth() must return an array')
  result.forEach((point) => {
    assert.ok(
      typeof point.date === 'string' &&
      typeof point.newMembers === 'number' &&
      typeof point.totalMembers === 'number',
      'Each point must have proper MemberGrowthDataPoint shape',
    )
  })
})

test('getMockAnalyticsSummary() returns complete AnalyticsSummary object', () => {
  const result = getMockAnalyticsSummary()

  assert.ok(
    typeof result.totalMembers === 'number',
    'result.totalMembers must be a number',
  )
  assert.ok(
    typeof result.activeMembers === 'number',
    'result.activeMembers must be a number',
  )
  assert.ok(
    Array.isArray(result.memberGrowth),
    'result.memberGrowth must be an array',
  )
  assert.ok(
    Array.isArray(result.resourceAccess),
    'result.resourceAccess must be an array',
  )
  assert.ok(
    typeof result.generatedAt === 'string',
    'result.generatedAt must be a string',
  )
})

test('getMockAnalyticsSummary() returns same object as MOCK_ANALYTICS_SUMMARY', () => {
  const result = getMockAnalyticsSummary()
  const direct = MOCK_ANALYTICS_SUMMARY

  assert.deepEqual(
    result,
    direct,
    'getMockAnalyticsSummary() must return same data as MOCK_ANALYTICS_SUMMARY',
  )
})

// ── Type safety validation tests ────────────────────────────────────────────

test('MOCK_ANALYTICS_SUMMARY is valid AnalyticsSummary (satisfies check)', () => {
  // This test verifies compile-time type safety:
  // If MOCK_ANALYTICS_SUMMARY doesn't satisfy AnalyticsSummary,
  // TypeScript compilation will fail before this test runs.
  const _typeCheck: AnalyticsSummary = MOCK_ANALYTICS_SUMMARY

  // At runtime, we just verify the reference is valid
  assert.ok(
    _typeCheck !== undefined,
    'Type assignment must complete without error',
  )
})

test('resourceAccess entries are valid ResourceAccessCount objects', () => {
  const { resourceAccess } = MOCK_ANALYTICS_SUMMARY

  resourceAccess.forEach((item) => {
    // This type assertion would fail at compile time if item doesn't match
    const _typeCheck: ResourceAccessCount = item

    assert.ok(_typeCheck !== undefined)
  })
})

// ── Data consistency tests ──────────────────────────────────────────────────

test('memberGrowth shows monotonic increase (or no change) in totalMembers', () => {
  const { memberGrowth } = MOCK_ANALYTICS_SUMMARY

  for (let i = 1; i < memberGrowth.length; i++) {
    const prev = memberGrowth[i - 1]
    const curr = memberGrowth[i]

    assert.ok(
      curr.totalMembers >= prev.totalMembers,
      `memberGrowth[${i}].totalMembers (${curr.totalMembers}) must be >= ` +
      `memberGrowth[${i - 1}].totalMembers (${prev.totalMembers})`,
    )
  }
})

test('memberGrowth.newMembers equals difference in totalMembers', () => {
  const { memberGrowth } = MOCK_ANALYTICS_SUMMARY

  for (let i = 1; i < memberGrowth.length; i++) {
    const prev = memberGrowth[i - 1]
    const curr = memberGrowth[i]
    const expectedNewMembers = curr.totalMembers - prev.totalMembers

    assert.strictEqual(
      curr.newMembers,
      expectedNewMembers,
      `memberGrowth[${i}].newMembers (${curr.newMembers}) must equal ` +
      `difference in totalMembers (${expectedNewMembers})`,
    )
  }
})

test('activeMembers <= totalMembers', () => {
  const { totalMembers, activeMembers } = MOCK_ANALYTICS_SUMMARY

  assert.ok(
    activeMembers <= totalMembers,
    `activeMembers (${activeMembers}) must be <= totalMembers (${totalMembers})`,
  )
})

test('resourceAccess entries have non-negative counts', () => {
  const { resourceAccess } = MOCK_ANALYTICS_SUMMARY

  resourceAccess.forEach((item, index) => {
    assert.ok(
      item.accessCount >= 0,
      `resourceAccess[${index}].accessCount must be >= 0`,
    )
    assert.ok(
      item.deniedCount >= 0,
      `resourceAccess[${index}].deniedCount must be >= 0`,
    )
  })
})
