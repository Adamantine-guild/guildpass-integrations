/**
 * lib/api/mock/core.ts
 *
 * Core read paths of the mock API: meta/version, community, resource and
 * policy lookups, and wallet verification. Extracted from lib/api/mock.ts.
 */
import {
  MOCK_META_VERSION_OVERRIDE,
  getMockResourceFetchDelayMs,
  getMockResourceFetchFailure,
  mockResourceFetchError,
} from './controls'
import {
  getCommunityState,
  initPromise,
  type MockApiContext,
} from './state'
import { EXPECTED_API_VERSION } from '../types'
import type {
  AccessPolicy,
  Community,
  MetaResponse,
  Resource,
  ResourceLookupResult,
  WalletVerification,
} from '../types'

export async function mockGetMeta(_signal?: AbortSignal): Promise<MetaResponse> {
  await initPromise
  return {
    version: MOCK_META_VERSION_OVERRIDE ?? EXPECTED_API_VERSION,
    commit: 'mock-commit-sha',
    uptime: (typeof process !== 'undefined' && typeof process.uptime === 'function') ? Math.floor(process.uptime()) : 0,
  }
}

export async function mockGetCommunity(ctx: MockApiContext, _signal?: AbortSignal): Promise<Community> {
  await initPromise
  return getCommunityState(ctx.communityId).community
}

export async function mockVerifyWallet(_address: string, _signal?: AbortSignal): Promise<WalletVerification> {
  await initPromise
  return {
    verified: true,
    method: 'mock',
    checkedAt: new Date().toISOString(),
  }
}

export async function mockListResources(ctx: MockApiContext, _signal?: AbortSignal): Promise<Resource[]> {
  await initPromise
  const state = getCommunityState(ctx.communityId)
  return state.resources.map((r) => ({ ...r, roles: r.roles ?? [] }))
}

export async function mockListPolicies(ctx: MockApiContext, _signal?: AbortSignal): Promise<AccessPolicy[]> {
  await initPromise
  const state = getCommunityState(ctx.communityId)
  return state.policies.map((p) => ({ ...p, roles: p.roles ?? [] }))
}

export async function mockGetResource(
  ctx: MockApiContext,
  id: string,
  _signal?: AbortSignal,
): Promise<ResourceLookupResult> {
  await initPromise
  if (getMockResourceFetchDelayMs() > 0) await new Promise((r) => setTimeout(r, getMockResourceFetchDelayMs()))
  if (getMockResourceFetchFailure()) {
    return { status: 'error', error: mockResourceFetchError() }
  }
  const state = getCommunityState(ctx.communityId)
  const r = state.resources.find((x) => x.id === id)
  return r
    ? { status: 'found', data: { ...r, roles: r.roles ?? [] }, source: 'direct' }
    : { status: 'not_found' }
}

export async function mockGetPolicy(
  ctx: MockApiContext,
  resourceId: string,
  _signal?: AbortSignal,
): Promise<AccessPolicy | null> {
  await initPromise
  if (getMockResourceFetchDelayMs() > 0) await new Promise((r) => setTimeout(r, getMockResourceFetchDelayMs()))
  if (getMockResourceFetchFailure()) {
    throw mockResourceFetchError()
  }
  const state = getCommunityState(ctx.communityId)
  const p = state.policies.find((x) => x.resourceId === resourceId)
  return p ? { ...p, roles: p.roles ?? [] } : null
}