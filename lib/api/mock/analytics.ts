/**
 * lib/api/mock/analytics.ts
 *
 * Analytics domain of the mock API: the live admin analytics summary
 * endpoint (computed from the in-memory store) and the AnalyticsDataSource
 * built on the analytics fixtures. Extracted from lib/api/mock.ts.
 */
import { getMemberGrowth, getResourceAccess } from '../analytics/mock'
import {
  getCommunityState,
  initPromise,
  type MockApiContext,
} from './state'
import type {
  AnalyticsDataSource,
  AnalyticsSummary,
  Role,
} from '../types'

export async function mockGetAnalyticsSummary(
  ctx: MockApiContext,
  _signal?: AbortSignal,
): Promise<AnalyticsSummary> {
  await initPromise
  const state = getCommunityState(ctx.communityId)
  const activeCount = Object.values(state.memberStore).filter(m => m.membership.active).length
  const totalCount = Object.values(state.memberStore).length
  const resourceAccess = state.resources.map(r => ({
    resourceId: r.id,
    resourceTitle: r.title,
    accessCount: Math.floor(Math.random() * 100) + 10,
    deniedCount: Math.floor(Math.random() * 20),
  }))
  const summary: AnalyticsSummary = {
    totalMembers: totalCount,
    activeMembers: activeCount,
    memberGrowth: Array.from({ length: 30 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (29 - i))
      return {
        date: d.toISOString().split('T')[0],
        newMembers: Math.floor(Math.random() * 3),
        totalMembers: totalCount - (29 - i) * 2,
      }
    }),
    resourceAccess,
    generatedAt: new Date().toISOString(),
  }
  return new Promise((resolve) =>
    setTimeout(() => resolve(summary), 300),
  )
}

/**
 * Build the AnalyticsDataSource surface for a MockAccessApi instance.
 * The three accessors read from the analytics fixture module, with role
 * distribution computed live from the community's member store.
 */
export function buildAnalyticsDataSource(ctx: MockApiContext): AnalyticsDataSource {
  return {
    getMembershipTrend: async (_signal?: AbortSignal) => {
      await initPromise;
      return getMemberGrowth();
    },
    getRoleDistribution: async (_signal?: AbortSignal) => {
      await initPromise;
      const state = getCommunityState(ctx.communityId);
      const members = Object.values(state.memberStore);
      const ALL_ROLES: Role[] = ['member', 'moderator', 'admin'];
      return ALL_ROLES.map(role => ({
        role,
        count: members.filter(m => m.roles.includes(role)).length
      }));
    },
    getAccessAttempts: async (_signal?: AbortSignal) => {
      await initPromise;
      return getResourceAccess();
    }
  }
}