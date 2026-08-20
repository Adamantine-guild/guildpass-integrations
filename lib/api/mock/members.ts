/**
 * lib/api/mock/members.ts
 *
 * Member-domain read paths and the self-service profile mutation for the
 * mock API. Extracted from lib/api/mock.ts.
 */
import { ProfileValidationError, validateProfile } from '../../validation/profile'
import { ApiError } from '../errors'
import { MOCK_SESSION_STATE, throwMockUnauthorized } from './session'
import {
  ensureAddress,
  getCommunityState,
  initPromise,
  schedulePersist,
  type MockApiContext,
} from './state'
import type {
  MemberProfile,
  MemberRow,
  Membership,
  PaginatedMembers,
} from '../types'

export async function mockGetMembership(
  ctx: MockApiContext,
  address: string,
  _signal?: AbortSignal,
): Promise<Membership | null> {
  await initPromise
  const data = ensureAddress(address, ctx.communityId)
  return data?.membership ?? null
}

export async function mockGetProfile(
  ctx: MockApiContext,
  address: string,
  _signal?: AbortSignal,
): Promise<MemberProfile | null> {
  await initPromise
  const data = ensureAddress(address, ctx.communityId)
  return data?.profile ?? null
}

/**
 * Updates the caller's own profile. Mirrors the live client's self-service
 * ownership check (`ctx.address` must match `profile.address`) even
 * though mock mode has no real signature to verify, so the two clients
 * behave the same way from a caller's perspective. `badges` is
 * system-assigned and is always preserved from the existing record,
 * regardless of what the caller passes.
 */
export async function mockUpdateProfile(ctx: MockApiContext, profile: MemberProfile): Promise<void> {
  await initPromise
  if (MOCK_SESSION_STATE === 'expired') throwMockUnauthorized()

  if (!ctx.address || ctx.address.toLowerCase() !== profile.address?.toLowerCase()) {
    throw new ApiError({
      status: 403,
      code: 'forbidden',
      safeMessage: 'You can only edit your own profile.',
    })
  }

  const result = validateProfile(profile)
  if (!result.valid) {
    throw new ProfileValidationError(result.errors)
  }

  const data = ensureAddress(result.value.address, ctx.communityId)
  if (!data) {
    throw new ApiError({
      status: 404,
      code: 'not_found',
      safeMessage: `Member "${result.value.address}" not found.`,
    })
  }

  data.profile = {
    ...data.profile,
    displayName: result.value.displayName,
    bio: result.value.bio,
    avatar: result.value.avatar,
    socialLinks: result.value.socialLinks,
  }
  schedulePersist()
}

export async function mockListMembers(
  ctx: MockApiContext,
  params?: { cursor?: string; limit?: number; filter?: string },
  _signal?: AbortSignal,
): Promise<MemberRow[] | PaginatedMembers> {
  await initPromise
  const state = getCommunityState(ctx.communityId)
  let list = Object.values(state.memberStore).map((m) => ({
    address: m.membership.address,
    roles: m.roles,
    tier: m.membership.tier,
    active: m.membership.active,
    ...(m.profile.displayName ? { displayName: m.profile.displayName } : {}),
  }))

  if (!params) {
    return list
  }

  if (params.filter) {
    const f = params.filter.toLowerCase()
    list = list.filter((m) => m.address.toLowerCase().includes(f))
  }

  const limit = params.limit ?? 100
  const cursor = params.cursor ? parseInt(params.cursor, 10) : 0

  const paginated = list.slice(cursor, cursor + limit)
  const nextCursor = cursor + limit < list.length ? String(cursor + limit) : undefined

  return {
    members: paginated,
    nextCursor,
  }
}