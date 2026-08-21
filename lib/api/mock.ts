/**
 * lib/api/mock.ts
 *
 * In-memory mock API for local development and testing.
 *
 * The implementation is organised into focused modules under `lib/api/mock/`
 * so a structural mistake in one domain cannot break the whole API layer:
 *
 *   - domains.ts     — canonical domain registry used by structure tests
 *   - fixtures.ts    — fixture/seeded data (communities, members, events…)
 *   - state.ts       — the in-memory per-community store + persistence
 *   - session.ts     — SIWE endpoints + cookie-session simulation
 *   - core.ts        — meta/community/resource/policy reads, wallet verification
 *   - members.ts     — member reads + self-service profile mutation
 *   - analytics.ts   — admin analytics summary + AnalyticsDataSource
 *   - webhooks.ts    — webhook feed, replay, admin event log
 *   - approvals.ts   — role/policy mutations + multi-approval pending actions
 *   - social.ts      — connections, privacy settings, blocks
 *   - moderation.ts  — moderation report queue
 *   - governance.ts  — proposals and weighted voting
 *   - controls.ts    — fault-injection knobs + API-version override
 *   - scenarios.ts   — developer scenario presets + mock reset
 *
 * This module is the stable aggregation point: it composes `MockAccessApi`
 * from the domain modules and re-exports every symbol that consumers of
 * `lib/api/mock` (and `lib/api/index.ts`) relied on historically.
 *
 * All existing member/resource/policy data and mutation logic is preserved.
 */
import { config } from '../config'
import { buildAnalyticsDataSource, mockGetAnalyticsSummary } from './mock/analytics'
import {
  mockApproveAction,
  mockAssignRole,
  mockGetPendingActions,
  mockRejectAction,
  mockRemoveRole,
  mockUpdateApprovalConfig,
  mockUpdatePolicy,
} from './mock/approvals'
import {
  mockGetCommunity,
  mockGetMeta,
  mockGetPolicy,
  mockGetResource,
  mockListPolicies,
  mockListResources,
  mockVerifyWallet,
} from './mock/core'
import {
  MOCK_META_VERSION_OVERRIDE,
  setMockMetaVersion,
  setMockResourceFetchDelay,
  setMockResourceFetchFailure,
  setMockRoleMutationFailure,
} from './mock/controls'
import { mockConnections, mockPrivacySettings, mockReports } from './mock/fixtures'
import {
  mockCastVote,
  mockCloseProposalVoting,
  mockCreateProposal,
  mockDeleteProposal,
  mockGetMemberVote,
  mockGetProposal,
  mockListProposalVotes,
  mockListProposals,
  mockPublishProposal,
  mockResolveProposal,
  mockUpdateProposal,
} from './mock/governance'
import {
  mockGetMembership,
  mockGetProfile,
  mockListMembers,
  mockUpdateProfile,
} from './mock/members'
import { mockGetReport, mockListReports, mockUpdateReportState } from './mock/moderation'
import { applyMockScenario, resetMockData } from './mock/scenarios'
import {
  mockGetNonce,
  mockGetSession,
  mockGetSessionStatus,
  mockSiweLogout,
  mockSiweRefresh,
  mockSiweVerify,
} from './mock/session'
import {
  mockAcceptConnectionRequest,
  mockBlockMember,
  mockCreateConnectionRequest,
  mockGetConnections,
  mockGetPrivacySettings,
  mockRejectConnectionRequest,
  mockUnblockMember,
  mockUpdatePrivacySettings,
} from './mock/social'
import {
  communityStates,
  getCommunityState,
  type CommunityState,
  type MockApiContext,
} from './mock/state'
import {
  mockListAdminEvents,
  mockListWebhookEvents,
  mockReplayEvent,
  mockSubscribeWebhookEvents,
  replayMockEvent,
} from './mock/webhooks'
import type {
  AccessApi,
  AccessPolicy,
  AdminEventFilterParams,
  AnalyticsDataSource,
  AnalyticsSummary,
  ApprovalConfig,
  Community,
  Connection,
  MemberPrivacySettings,
  MemberProfile,
  MemberRow,
  Membership,
  MetaResponse,
  ModerationReport,
  ModerationState,
  Paginated,
  PaginatedMembers,
  PendingAction,
  Proposal,
  ProposalStatus,
  ProposalType,
  Resource,
  ResourceLookupResult,
  Role,
  Session,
  SessionStatus,
  SiweAuthSession,
  Vote,
  VoteChoice,
  WalletVerification,
  WebhookEvent,
  WebhookEventLog,
  WebhookEventUnsubscribe,
} from './types'

export {
  applyMockScenario,
  communityStates,
  getCommunityState,
  MOCK_META_VERSION_OVERRIDE,
  mockConnections,
  mockPrivacySettings,
  mockReports,
  replayMockEvent,
  resetMockData,
  setMockMetaVersion,
  setMockResourceFetchDelay,
  setMockResourceFetchFailure,
  setMockRoleMutationFailure,
}
export type { CommunityState, MockApiContext }

export class MockAccessApi implements AccessApi {
  /** In-memory nonce store keyed by nonce value → creation timestamp. */
  readonly #nonceStore = new Map<string, number>()

  readonly address?: string
  readonly communityId: string

  /** Analytics surface exposed on the API client (see AdminAccessApi). */
  public analytics: AnalyticsDataSource

  constructor(
    address?: string,
    communityId?: string,
  ) {
    this.address = address
    this.communityId = communityId ?? 'guildpass-demo'
    this.analytics = buildAnalyticsDataSource({
      address: this.address,
      communityId: this.communityId,
      authMode: config.authMode,
    })
  }

  /** Fresh per-call context so config-derived values are never stale. */
  #ctx(): MockApiContext {
    return {
      address: this.address,
      communityId: this.communityId,
      authMode: config.authMode,
    }
  }

  // ── Read-only ──────────────────────────────────────────────────────────────

  async getMeta(_signal?: AbortSignal): Promise<MetaResponse> {
    return mockGetMeta(_signal)
  }

  async getSession(_signal?: AbortSignal): Promise<Session> {
    return mockGetSession(this.#ctx(), _signal)
  }

  async getCommunity(_signal?: AbortSignal): Promise<Community> {
    return mockGetCommunity(this.#ctx(), _signal)
  }

  async getMembership(address: string, _signal?: AbortSignal): Promise<Membership | null> {
    return mockGetMembership(this.#ctx(), address, _signal)
  }

  async getProfile(address: string, _signal?: AbortSignal): Promise<MemberProfile | null> {
    return mockGetProfile(this.#ctx(), address, _signal)
  }

  /**
   * Updates the caller's own profile. See lib/api/mock/members.ts for the
   * self-service ownership check semantics.
   */
  async updateProfile(profile: MemberProfile): Promise<void> {
    return mockUpdateProfile(this.#ctx(), profile)
  }

  async listMembers(params?: { cursor?: string; limit?: number; filter?: string }, _signal?: AbortSignal): Promise<MemberRow[] | PaginatedMembers> {
    return mockListMembers(this.#ctx(), params, _signal)
  }

  async listResources(_signal?: AbortSignal): Promise<Resource[]> {
    return mockListResources(this.#ctx(), _signal)
  }

  async listPolicies(_signal?: AbortSignal): Promise<AccessPolicy[]> {
    return mockListPolicies(this.#ctx(), _signal)
  }

  async getResource(id: string, _signal?: AbortSignal): Promise<ResourceLookupResult> {
    return mockGetResource(this.#ctx(), id, _signal)
  }

  async getPolicy(resourceId: string, _signal?: AbortSignal): Promise<AccessPolicy | null> {
    return mockGetPolicy(this.#ctx(), resourceId, _signal)
  }

  // ── Admin queries & mutations ──────────────────────────────────────────────

  async listWebhookEvents(_signal?: AbortSignal): Promise<WebhookEventLog[]> {
    return mockListWebhookEvents(this.#ctx(), _signal)
  }

  subscribeWebhookEvents(onEvent: (event: WebhookEventLog) => void): WebhookEventUnsubscribe {
    return mockSubscribeWebhookEvents(this.communityId, onEvent)
  }

  async replayEvent(eventId: string): Promise<WebhookEventLog> {
    return mockReplayEvent(this.#ctx(), eventId)
  }

  async getAnalyticsSummary(_signal?: AbortSignal): Promise<AnalyticsSummary> {
    return mockGetAnalyticsSummary(this.#ctx(), _signal)
  }

  async getPendingActions(): Promise<PendingAction[]> {
    return mockGetPendingActions(this.#ctx())
  }

  async approveAction(id: string): Promise<void> {
    return mockApproveAction(this.#ctx(), id)
  }

  async rejectAction(id: string): Promise<void> {
    return mockRejectAction(this.#ctx(), id)
  }

  async updateApprovalConfig(config: ApprovalConfig): Promise<void> {
    return mockUpdateApprovalConfig(this.#ctx(), config)
  }

  async assignRole(address: string, role: Role): Promise<{ status: 'executed' | 'pending'; pendingActionId?: string }> {
    return mockAssignRole(this.#ctx(), address, role)
  }

  async removeRole(address: string, role: Role): Promise<{ status: 'executed' | 'pending'; pendingActionId?: string }> {
    return mockRemoveRole(this.#ctx(), address, role)
  }

  async updatePolicy(policy: AccessPolicy): Promise<{ status: 'executed' | 'pending'; pendingActionId?: string }> {
    return mockUpdatePolicy(this.#ctx(), policy)
  }

  async listAdminEvents(params?: AdminEventFilterParams): Promise<Paginated<WebhookEvent>> {
    return mockListAdminEvents(this.#ctx(), params)
  }

  // ── SIWE mock endpoints ────────────────────────────────────────────────────

  async getNonce(address: string): Promise<string> {
    return mockGetNonce(this.#ctx(), this.#nonceStore, address)
  }

  async siweVerify(message: string, signature: string): Promise<SiweAuthSession> {
    return mockSiweVerify(this.#ctx(), this.#nonceStore, message, signature)
  }

  async siweRefresh(refreshToken: string): Promise<SiweAuthSession> {
    return mockSiweRefresh(this.#ctx(), refreshToken)
  }

  async siweLogout(_token?: string): Promise<void> {
    return mockSiweLogout(this.#ctx(), _token)
  }

  async getSessionStatus(_signal?: AbortSignal): Promise<SessionStatus> {
    return mockGetSessionStatus(this.#ctx(), _signal)
  }

  async verifyWallet(_address: string, _signal?: AbortSignal): Promise<WalletVerification> {
    return mockVerifyWallet(_address, _signal)
  }

  // ── Social Graph (Connections / Blocks) ──
  async getConnections(address: string, _signal?: AbortSignal): Promise<Connection[]> {
    return mockGetConnections(this.#ctx(), address, _signal)
  }

  async getPrivacySettings(address: string, _signal?: AbortSignal): Promise<MemberPrivacySettings> {
    return mockGetPrivacySettings(this.#ctx(), address, _signal)
  }

  async updatePrivacySettings(address: string, settings: MemberPrivacySettings): Promise<void> {
    return mockUpdatePrivacySettings(this.#ctx(), address, settings)
  }

  async blockMember(targetAddress: string): Promise<void> {
    return mockBlockMember(this.#ctx(), targetAddress)
  }

  async unblockMember(targetAddress: string): Promise<void> {
    return mockUnblockMember(this.#ctx(), targetAddress)
  }

  async createConnectionRequest(targetAddress: string): Promise<void> {
    return mockCreateConnectionRequest(this.#ctx(), targetAddress)
  }

  async acceptConnectionRequest(targetAddress: string): Promise<void> {
    return mockAcceptConnectionRequest(this.#ctx(), targetAddress)
  }

  async rejectConnectionRequest(targetAddress: string): Promise<void> {
    return mockRejectConnectionRequest(this.#ctx(), targetAddress)
  }

  // ── Moderation Queue ──
  async listReports(_signal?: AbortSignal): Promise<ModerationReport[]> {
    return mockListReports(_signal)
  }

  async getReport(id: string, _signal?: AbortSignal): Promise<ModerationReport | null> {
    return mockGetReport(id, _signal)
  }

  async updateReportState(id: string, state: ModerationState, updates?: Partial<ModerationReport>): Promise<void> {
    return mockUpdateReportState(id, state, updates)
  }

  // ── Governance ──
  async listProposals(params?: { filter?: ProposalStatus | ProposalType; limit?: number; cursor?: string }, _signal?: AbortSignal): Promise<Proposal[]> {
    return mockListProposals(this.#ctx(), params, _signal)
  }

  async getProposal(id: string, _signal?: AbortSignal): Promise<Proposal | null> {
    return mockGetProposal(this.#ctx(), id, _signal)
  }

  async getMemberVote(proposalId: string, _signal?: AbortSignal): Promise<Vote | null> {
    return mockGetMemberVote(this.#ctx(), proposalId, _signal)
  }

  async listProposalVotes(proposalId: string, params?: { limit?: number; cursor?: string }, _signal?: AbortSignal): Promise<Vote[]> {
    return mockListProposalVotes(this.#ctx(), proposalId, params, _signal)
  }

  async castVote(proposalId: string, choice: VoteChoice): Promise<Vote> {
    return mockCastVote(this.#ctx(), proposalId, choice)
  }

  async createProposal(proposal: Omit<Proposal, 'id' | 'createdAt' | 'status' | 'communityId' | 'votesSummary' | 'totalWeight'>): Promise<Proposal> {
    return mockCreateProposal(this.#ctx(), proposal)
  }

  async updateProposal(id: string, updates: Partial<Omit<Proposal, 'id' | 'status' | 'proposer' | 'createdAt' | 'votesSummary' | 'totalWeight'>>): Promise<Proposal> {
    return mockUpdateProposal(this.#ctx(), id, updates)
  }

  async publishProposal(id: string): Promise<Proposal> {
    return mockPublishProposal(this.#ctx(), id)
  }

  async closeProposalVoting(id: string): Promise<Proposal> {
    return mockCloseProposalVoting(this.#ctx(), id)
  }

  async resolveProposal(id: string, outcome: string): Promise<Proposal> {
    return mockResolveProposal(this.#ctx(), id, outcome)
  }

  async deleteProposal(id: string): Promise<void> {
    return mockDeleteProposal(this.#ctx(), id)
  }
}