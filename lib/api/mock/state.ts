/**
 * lib/api/mock/state.ts
 *
 * The in-memory mock store: per-community state, lazy initialisation, and
 * persistence orchestration (IndexedDB/localStorage fallback). Extracted
 * from lib/api/mock.ts so the store lives in one focused module that every
 * mock API domain can share.
 */
import type {
  AccessPolicy,
  Community,
  MemberProfile,
  Membership,
  PendingAction,
  Proposal,
  Resource,
  Role,
  Vote,
  WebhookEventLog,
} from '../types'
import {
  DEFAULT_COMMUNITY,
  DEFAULT_MEMBER_STORE,
  DEFAULT_POLICIES,
  DEFAULT_RESOURCES,
  DEFAULT_WEBHOOK_EVENTS,
  MOCK_COMMUNITIES,
  MOCK_MEMBER_STORES,
  MOCK_POLICIES,
  MOCK_RESOURCES,
} from './fixtures'
import {
  LS_KEY,
  loadPersistedState,
  persistState,
} from '../mock-storage'

/**
 * Call context shared by every mock API domain implementation. Built by
 * MockAccessApi per call so `config`-derived values are always fresh.
 */
export interface MockApiContext {
  address?: string
  communityId: string
  /** Auth mode as read from config (bearer vs. cookie session simulation). */
  authMode: 'bearer' | 'cookie'
}

export interface CommunityState {
  community: Community
  resources: Resource[]
  policies: AccessPolicy[]
  webhookEvents: WebhookEventLog[]
  memberStore: Record<string, { membership: Membership; roles: Role[]; profile: MemberProfile }>
  pendingActions: PendingAction[]
  proposals: Record<string, Proposal>
  votes: Record<string, Vote>  // Maps vote ID to Vote
}

export let communityStates: Record<string, CommunityState> = {}

export function getCommunityState(communityId: string = 'guildpass-demo'): CommunityState {
  const normalizedId = MOCK_COMMUNITIES[communityId] ? communityId : 'guildpass-demo'
  if (!communityStates[normalizedId]) {
    communityStates[normalizedId] = {
      community: { ...MOCK_COMMUNITIES[normalizedId] },
      resources: [...(MOCK_RESOURCES[normalizedId] ?? [])],
      policies: [...(MOCK_POLICIES[normalizedId] ?? [])],
      webhookEvents: [...DEFAULT_WEBHOOK_EVENTS],
      memberStore: Object.fromEntries(
        Object.entries(MOCK_MEMBER_STORES[normalizedId] ?? {}).map(([k, v]) => [
          k,
          { ...v, roles: [...v.roles], membership: { ...v.membership }, profile: { ...v.profile } }
        ])
      ),
      pendingActions: [],
      proposals: {},
      votes: {},
    }
  }
  return communityStates[normalizedId]
}

/** Rebuild every community's state from scratch (used by resetMockData). */
export function resetCommunityStates(): void {
  communityStates = {}
  for (const cid of Object.keys(MOCK_COMMUNITIES)) {
    getCommunityState(cid)
  }
}

/** Generate a random webhook event and prepend it to the live feed. */
export function createMockStreamEvent(communityId: string = 'guildpass-demo'): WebhookEventLog {
  const state = getCommunityState(communityId)
  const base = DEFAULT_WEBHOOK_EVENTS[Math.floor(Math.random() * DEFAULT_WEBHOOK_EVENTS.length)]
  const statuses: WebhookEventLog['status'][] = ['success', 'pending', 'failed']
  const event: WebhookEventLog = {
    ...base,
    id: `stream_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    timestamp: new Date().toISOString(),
    status: statuses[Math.floor(Math.random() * statuses.length)],
    isReplay: false,
    fullPayload: {
      ...(base.fullPayload ?? base.payloadSummary),
      source: 'mock-sse-stream',
    },
  }
  state.webhookEvents.unshift(event)
  return event
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null

async function saveState() {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(async () => {
    await persistState({ communityStates } as any)
  }, 100)
}

/** Debounced persistence trigger — call after any mutating mock operation. */
export function schedulePersist(): void {
  saveState().catch(() => {})
}

/**
 * Resolves once the persisted store (if any) has been loaded into
 * `communityStates`. Every mock API operation awaits it first.
 */
export const initPromise = loadPersistedState().then((persisted) => {
  if (!persisted) {
    resetCommunityStates()
    return
  }
  if ((persisted as any).communityStates) {
    communityStates = (persisted as any).communityStates
  } else {
    // Backward compatibility: load legacy state into guildpass-demo
    communityStates['guildpass-demo'] = {
      community: (persisted as any).community || { ...DEFAULT_COMMUNITY },
      resources: (persisted as any).resources || [...DEFAULT_RESOURCES],
      policies: (persisted as any).policies || [...DEFAULT_POLICIES],
      webhookEvents: (persisted as any).webhookEvents || [...DEFAULT_WEBHOOK_EVENTS],
      memberStore: (persisted as any).memberStore || { ...DEFAULT_MEMBER_STORE },
      pendingActions: (persisted as any).pendingActions || [],
      proposals: (persisted as any).proposals || {},
      votes: (persisted as any).votes || {},
    }
  }
  for (const cid of Object.keys(MOCK_COMMUNITIES)) {
    getCommunityState(cid)
  }
})

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (saveTimeout) clearTimeout(saveTimeout)
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ communityStates }))
    } catch { /* ignore */ }
  })
}

/** Lazily seed a member record for the given address, mirroring a backend that auto-provisions members. */
export function ensureAddress(addr?: string, communityId: string = 'guildpass-demo') {
  if (!addr) return null
  const state = getCommunityState(communityId)
  if (!state.memberStore[addr]) {
    state.memberStore[addr] = {
      membership: {
        address: addr,
        tier: 'free',
        active: true,
      },
      roles: ['member'],
      profile: {
        address: addr,
        displayName: `User ${addr.slice(0, 6)}`,
        badges: ['Early Member', 'Beta Tester'],
      },
    }
  }
  return state.memberStore[addr]
}