/**
 * lib/api/analytics/mock.ts
 *
 * Analytics fixture data — the single source of truth for analytics mock responses.
 *
 * The mock is explicitly typed as AnalyticsSummary so shape changes are caught
 * at compile time, not when Next.js compiles the module.
 *
 * All fields match the production API response shape exactly. Use the access
 * functions (getMockAnalyticsSummary, getResourceAccess) instead of importing
 * MOCK_ANALYTICS_SUMMARY directly to allow future swapping with real API calls.
 */

import type { AnalyticsSummary } from '../types'

/**
 * Generates a seeded member growth time series for the last 30 days.
 * Starts at 80 members and grows by 1–4 per day with a mild upward trend.
 *
 * @returns Array of daily member growth data points
 */
function generateMockMemberGrowth(): AnalyticsSummary['memberGrowth'] {
  const days = 30
  const points: AnalyticsSummary['memberGrowth'] = []
  let total = 80

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    // Weekday gets more sign-ups; weekend less
    const dayOfWeek = d.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const newMembers = isWeekend
      ? Math.floor(Math.random() * 2)           // 0–1 on weekends
      : Math.floor(Math.random() * 4) + 1       // 1–4 on weekdays
    total += newMembers
    points.push({ date: dateStr, newMembers, totalMembers: total })
  }

  return points
}

/**
 * Analytics fixture data — the single source of truth for analytics mock responses.
 * Explicitly typed as AnalyticsSummary so shape changes are caught at compile time,
 * not when Next.js compiles the module.
 *
 * All fields match the production API response shape exactly.
 */
const MOCK_ANALYTICS_SUMMARY: AnalyticsSummary = {
  totalMembers: 124,
  activeMembers: 98,
  memberGrowth: generateMockMemberGrowth(),
  resourceAccess: [
    { resourceId: 'alpha',       resourceTitle: 'Alpha Docs',     accessCount: 312, deniedCount: 47  },
    { resourceId: 'pro-reports', resourceTitle: 'Pro Reports',    accessCount: 189, deniedCount: 103 },
    { resourceId: 'mem-updates', resourceTitle: 'Member Updates', accessCount: 541, deniedCount: 12  },
  ],
  generatedAt: new Date().toISOString(),
} as const satisfies AnalyticsSummary

/**
 * Returns the resourceAccess field from the analytics summary.
 * Type-safe: return type is inferred from AnalyticsSummary, not 'any'.
 *
 * This is the canonical accessor for resource access analytics data.
 * Type: AnalyticsSummary['resourceAccess'] (narrowed from type property)
 *
 * @returns Resource access counts for all gated resources
 */
export function getResourceAccess(): AnalyticsSummary['resourceAccess'] {
  return MOCK_ANALYTICS_SUMMARY.resourceAccess
}

/**
 * Returns the memberGrowth field from the analytics summary.
 * Type-safe: return type is inferred from AnalyticsSummary, not 'any'.
 *
 * This is the canonical accessor for member growth data.
 *
 * @returns Daily member growth data points
 */
export function getMemberGrowth(): AnalyticsSummary['memberGrowth'] {
  return MOCK_ANALYTICS_SUMMARY.memberGrowth
}

/**
 * Returns the full analytics summary mock.
 * Type-safe: return type is AnalyticsSummary, not any.
 *
 * Use this function instead of importing MOCK_ANALYTICS_SUMMARY directly
 * to allow future swapping with real API calls or cached responses.
 *
 * @returns Complete analytics summary object
 */
export function getMockAnalyticsSummary(): AnalyticsSummary {
  return MOCK_ANALYTICS_SUMMARY
}

/**
 * Re-export the mock constant for backward compatibility and direct access.
 * Explicitly typed as AnalyticsSummary.
 */
export { MOCK_ANALYTICS_SUMMARY }
