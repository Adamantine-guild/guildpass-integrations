/**
 * lib/api/analytics/types.ts
 *
 * Type definitions for analytics summary data.
 *
 * These types ensure MOCK_ANALYTICS_SUMMARY and its access functions
 * are checked at compile time — shape changes cause TypeScript errors
 * rather than silent runtime failures.
 *
 * The types are re-exported from lib/api/types.ts where they are also
 * defined for backward compatibility. This module serves as the focused
 * boundary for analytics-specific type safety.
 */

import type {
  AnalyticsSummary,
  ResourceAccessCount,
  MemberGrowthDataPoint,
} from '../types'

import {
  AnalyticsSummarySchema,
  ResourceAccessCountSchema,
  MemberGrowthDataPointSchema,
} from '../types'

/**
 * Re-export analytics types for focused module boundaries.
 * These are the canonical definitions; this module re-exports them
 * to make it clear that analytics is a distinct concern.
 */
export type { AnalyticsSummary, ResourceAccessCount, MemberGrowthDataPoint }

/**
 * Re-export Zod schemas for runtime validation.
 */
export { AnalyticsSummarySchema, ResourceAccessCountSchema, MemberGrowthDataPointSchema }

/**
 * Type guard: runtime check that a value matches AnalyticsSummary shape.
 * Use this when parsing untrusted data (API responses, etc).
 *
 * @example
 * const data = await fetch('/api/analytics').then(r => r.json())
 * if (isAnalyticsSummary(data)) {
 *   // data is now typed as AnalyticsSummary
 *   console.log(data.totalMembers)
 * }
 */
export function isAnalyticsSummary(value: unknown): value is AnalyticsSummary {
  try {
    AnalyticsSummarySchema.parse(value)
    return true
  } catch {
    return false
  }
}

/**
 * Type guard: runtime check that a value matches ResourceAccessCount shape.
 */
export function isResourceAccessCount(value: unknown): value is ResourceAccessCount {
  try {
    ResourceAccessCountSchema.parse(value)
    return true
  } catch {
    return false
  }
}
