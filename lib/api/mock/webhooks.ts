/**
 * lib/api/mock/webhooks.ts
 *
 * Webhook & admin-event domain of the mock API: the live webhook feed,
 * event replay (both the API method and the standalone dev-tool export),
 * and the admin event log pagination. Extracted from lib/api/mock.ts.
 */
import { ApiError } from '../errors'
import {
  createMockStreamEvent,
  getCommunityState,
  initPromise,
  schedulePersist,
  type MockApiContext,
} from './state'
import type {
  AdminEventFilterParams,
  MembershipTier,
  Paginated,
  WebhookEvent,
  WebhookEventLog,
  WebhookEventUnsubscribe,
} from '../types'

export async function mockListWebhookEvents(ctx: MockApiContext, _signal?: AbortSignal): Promise<WebhookEventLog[]> {
  await initPromise
  const state = getCommunityState(ctx.communityId)
  return new Promise((resolve) => setTimeout(() => resolve(state.webhookEvents), 300))
}

export function mockSubscribeWebhookEvents(
  communityId: string,
  onEvent: (event: WebhookEventLog) => void,
): WebhookEventUnsubscribe {
  const cid = communityId
  const intervalId = globalThis.setInterval(() => {
    onEvent(createMockStreamEvent(cid))
  }, 5000)

  globalThis.setTimeout(() => onEvent(createMockStreamEvent(cid)), 1000)
  return () => globalThis.clearInterval(intervalId)
}

export async function mockReplayEvent(ctx: MockApiContext, eventId: string): Promise<WebhookEventLog> {
  await initPromise
  const state = getCommunityState(ctx.communityId)
  const original = state.webhookEvents.find((e) => e.id === eventId)
  if (!original) {
    throw new ApiError({
      status: 404,
      code: 'not_found',
      safeMessage: `Event "${eventId}" not found in mock store.`,
    })
  }

  const replay: WebhookEventLog = {
    ...original,
    id: `replay_${eventId}_${Date.now()}`,
    timestamp: new Date().toISOString(),
    isReplay: true,
    status: 'pending',
    fullPayload: original.fullPayload ?? { ...original.payloadSummary },
  }

  state.webhookEvents.unshift(replay)
  schedulePersist()
  return replay
}

/**
 * Replay a webhook event by cloning it into the mock event store.
 * The clone is marked with `isReplay: true` and inserted at the top
 * of the feed with a `pending` status so it is visually distinct.
 *
 * This function operates directly on the module-level mock store and
 * is intended for use by the admin event replay tool. It must only be
 * called when `config.apiMode === 'mock'`.
 */
export async function replayMockEvent(eventId: string, communityId: string = 'guildpass-demo'): Promise<WebhookEventLog> {
  await initPromise
  const state = getCommunityState(communityId)
  const original = state.webhookEvents.find((e) => e.id === eventId)
  if (!original) {
    throw new ApiError({
      status: 404,
      code: 'not_found',
      safeMessage: `Event "${eventId}" not found in mock store.`,
    })
  }

  const replay: WebhookEventLog = {
    ...original,
    id: `replay_${eventId}_${Date.now()}`,
    timestamp: new Date().toISOString(),
    isReplay: true,
    status: 'pending',
    fullPayload: original.fullPayload ?? { ...original.payloadSummary },
  }

  state.webhookEvents.unshift(replay)
  schedulePersist()

  // Apply side effects to the member store for recognised event types.
  const addr = original.affectedIdentifier
  if (addr && addr.startsWith('0x')) {
    const existing = state.memberStore[addr]
    switch (original.eventType) {
      case 'membership.created':
      case 'membership.renewed': {
        const tier = (original.payloadSummary.tier as MembershipTier) ?? 'free'
        state.memberStore[addr] = {
          membership: { address: addr, tier, active: true },
          roles: existing?.roles ?? ['member'],
          profile: existing?.profile ?? { address: addr, displayName: `Replayed ${addr.slice(0, 6)}`, badges: [] },
        }
        break
      }
      case 'membership.expired':
        if (existing) {
          state.memberStore[addr] = {
            ...existing,
            membership: { ...existing.membership, active: false },
          }
        }
        break
      case 'tier.upgraded': {
        const newTier = (original.payloadSummary.tier as MembershipTier) ?? 'standard'
        if (existing) {
          state.memberStore[addr] = {
            ...existing,
            membership: { ...existing.membership, tier: newTier },
          }
        }
        break
      }
      // policy.updated — no member-store side effect
    }
  }

  return replay
}

export async function mockListAdminEvents(
  ctx: MockApiContext,
  params?: AdminEventFilterParams,
): Promise<Paginated<WebhookEvent>> {
  let events = getCommunityState(ctx.communityId).webhookEvents as any[]

  if (params?.types && params.types.length > 0) {
    events = events.filter((e) => params.types!.includes(e.type))
  }

  if (params?.startDate) {
    const start = new Date(params.startDate)
    events = events.filter((e) => new Date(e.createdAt) >= start)
  }

  if (params?.endDate) {
    // Include the end date fully (e.g., up to end of the day)
    const end = new Date(params.endDate)
    end.setUTCHours(23, 59, 59, 999)
    events = events.filter((e) => new Date(e.createdAt) <= end)
  }

  const page = params?.page || 1
  const limit = params?.limit || 20
  const startIndex = (page - 1) * limit

  const paginated = events.slice(startIndex, startIndex + limit)

  return {
    data: paginated,
    total: events.length,
    page,
    limit
  }
}