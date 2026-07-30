const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_PATH = path.join(__dirname, '../test/fixtures/openapi.json');
const TARGET_PATH = path.join(__dirname, '../lib/api/types.ts');

const STATIC_SUFFIX = `
export type WebhookEventStatus = 'success' | 'failed' | 'pending';

export type WebhookEventType = 
  | 'membership.created' 
  | 'membership.renewed' 
  | 'membership.expired' 
  | 'tier.upgraded' 
  | 'policy.updated';

export type WebhookEventUnsubscribe = () => void

export interface WebhookEventLog {
  id: string;
  eventType: WebhookEventType;
  status: WebhookEventStatus;
  timestamp: string;
  affectedIdentifier: string; // Wallet address or Resource ID
  payloadSummary: {
    network?: string;
    txHash?: string;
    tier?: string;
    reason?: string;
  };
  /** Raw event payload for detail inspection (optional — added by the replay/debug tool). */
  fullPayload?: Record<string, unknown>;
  /** True when this entry was injected via the replay/debug tool rather than ingested from a real webhook. */
  isReplay?: boolean;
}

export interface ApprovalConfig {
  assignRole: number
  removeRole: number
  updatePolicy: number
}

/**
 * {@link Community} as actually returned in mock mode, which additionally
 * carries multi-admin approval thresholds. Kept separate from the
 * auto-generated \`Community\` interface (test/fixtures/openapi.json) rather
 * than added to it directly, since \`approvalConfig\` isn't part of the
 * OpenAPI schema yet.
 */
export interface CommunityWithApprovalConfig extends Community {
  approvalConfig?: ApprovalConfig
}

export type PendingActionType = 'assignRole' | 'removeRole' | 'updatePolicy'

/**
 * Result of an admin write mutation (assignRole/removeRole/updatePolicy).
 *
 * - 'executed' — applied immediately.
 * - 'pending'  — multi-admin approval threshold not yet met (see
 *   {@link ApprovalConfig} / {@link PendingActionType}); unrelated to
 *   connectivity.
 * - 'queued'   — the caller was offline or the request failed with a network
 *   error; the mutation was persisted to the durable offline mutation queue
 *   (see lib/offline/mutation-queue.ts) instead of failing, and will be
 *   replayed automatically once the app is back online.
 */
export type MutationResultStatus = 'executed' | 'pending' | 'queued'

export interface MutationResult {
  status: MutationResultStatus
  pendingActionId?: string
}

export interface PendingActionPayload {
  address?: string
  role?: string
  policy?: AccessPolicy
}

export interface PendingAction {
  id: string
  type: PendingActionType
  payload: PendingActionPayload
  proposer: string
  requiredApprovals: number
  currentApprovals: string[]
  status: 'pending' | 'approved' | 'rejected' | 'executed'
  createdAt: string
}

export interface WalletVerification {
  verified: boolean
  method?: string
  checkedAt: string
}

export interface ApiErrorBody {
  code?: string
  error?: string
  message?: string
  details?: Record<string, unknown>
}

// ── Analytics Types ──────────────────────────────────────────────────────────
// NOTE: The analytics endpoint is PROVISIONAL. The path /v1/admin/analytics
// has not yet been confirmed by guildpass-core. This contract is documented
// here so the frontend and backend can align. Tracked in issue #157.

/**
 * A single data point in the member growth time series.
 */
export interface MemberGrowthDataPoint {
  /** ISO 8601 date (YYYY-MM-DD) representing the start of the interval. */
  date: string
  /** Number of new members who joined during this interval. */
  newMembers: number
  /** Cumulative total member count at end of interval. */
  totalMembers: number
}

/**
 * Access attempt counts for a single gated resource.
 */
export interface ResourceAccessCount {
  resourceId: string
  resourceTitle: string
  /** Total number of access attempts for this resource. */
  accessCount: number
  /** Number of denied access attempts (insufficient tier/role). */
  deniedCount: number
}

/**
 * Top-level analytics summary for the admin dashboard.
 *
 * @provisional Endpoint \`/v1/admin/analytics\` is not yet implemented in
 * guildpass-core. This type definition captures the proposed contract so
 * frontend and backend can align. The mock implementation uses seeded data;
 * the live implementation will use this schema once the backend ships.
 */
export interface AnalyticsSummary {
  /** Total community member count. */
  totalMembers: number
  /** Count of members with an active membership. */
  activeMembers: number
  /** Member growth time series (most recent 30 days, daily intervals). */
  memberGrowth: MemberGrowthDataPoint[]
  /** Per-resource access and denial counts. */
  resourceAccess: ResourceAccessCount[]
  /** ISO timestamp when this summary was generated. */
  generatedAt: string
}

// ── Access Decision (cached per wallet + resource) ───────────────────────────

/**
 * Result of an access check for a specific resource.
 * This is the value stored in the route-level access cache.
 * Only safe display metadata is included — never sensitive tokens.
 */
export interface AccessDecision {
  /** Whether access is granted */
  allowed: boolean
  /** Human-readable reason for the decision (safe for display) */
  reason: string
  /** ISO timestamp of when the check was performed */
  checkedAt: string
}

export interface WebhookEvent {
  id: string
  type: string
  payload: any
  createdAt: string
  status?: string
}

export interface Paginated<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export interface AdminEventFilterParams {
  types?: string[]
  startDate?: string
  endDate?: string
  page?: number
  limit?: number
}

// ── Client-side State Types ──────────────────────────────────────────────────

/**
 * Distinct states of the admin authentication session.
 *
 * - disconnected   — no wallet connected
 * - connected      — wallet connected, but SIWE sign-in not yet performed
 * - authenticating — SIWE signing flow is in-flight
 * - authenticated  — valid, non-expired session token is held
 * - expired        — a session was held but the token has since expired (or
 *                    the backend rejected it with 401); re-auth is required
 */
export type AdminSessionStatus =
  | 'disconnected'
  | 'connected'
  | 'authenticating'
  | 'authenticated'
  | 'expired'

/**
 * Union of authenticated / unauthenticated states for the SIWE context.
 */
export type SiweAuthState =
  | SiweAuthSession
  | { isAuthenticated: false }

// ── Backend raw types (guildpass-core response shapes) ───────────────────────
// These are the shapes returned by /v1/* endpoints. The live API client maps
// them into the frontend types above. Fields are optional because backend
// versions may use snake_case or camelCase, and this mapping handles both.

export interface BackendMember {
  address?: string
  wallet_address?: string
  tier?: MembershipTier
  membership_tier?: MembershipTier
  active?: boolean
  is_active?: boolean
  expiresAt?: string
  expires_at?: string
  roles?: Role[]
  // Profile fields (returned by /v1/members/:address/profile)
  displayName?: string
  display_name?: string
  username?: string
  bio?: string
  avatar?: string
  socialLinks?: SocialLink[]
  social_links?: SocialLink[]
  badges?: string[]
}

export interface BackendResource {
  id: string
  title?: string
  name?: string
  description?: string
  minTier?: MembershipTier
  min_tier?: MembershipTier
  roles?: Role[]
  content?: ResourceContentBlock[]
}

export interface BackendPolicy {
  resourceId?: string
  resource_id?: string
  minTier?: MembershipTier
  min_tier?: MembershipTier
  roles?: Role[]
  rule?: AccessRule
  updatedAt?: string
  updated_at?: string
}

export interface BackendSession {
  address?: string
  wallet_address?: string
  roles?: Role[]
  membership?: Partial<BackendMember>
  community?: {
    id: string
    name: string
    description?: string
    tiers?: MembershipTier[]
  }
}

// ── Governance Types ──────────────────────────────────────────────────────────

/**
 * Proposal status lifecycle:
 * - draft: Created by admin, not yet active
 * - active: Open for voting by members
 * - closed: Voting period ended, awaiting resolution
 * - resolved: Outcome applied/executed
 */
export type ProposalStatus = 'draft' | 'active' | 'closed' | 'resolved'

export type ProposalType = 'policy_change' | 'resource_addition' | 'rule_update' | 'other'

export interface Proposal {
  id: string
  communityId: string
  type: ProposalType
  title: string
  description: string
  status: ProposalStatus
  proposer: string
  createdAt: string
  votingStartsAt: string
  votingEndsAt: string
  /** JSON-encoded proposal-specific data (e.g., policy diff, resource spec). */
  payload: Record<string, unknown>
  /** Total voting weight available (sum of all role/tier weights). */
  totalWeight: number
  /** Vote counts and weighted results. */
  votesSummary: VotesSummary
}

export interface VotesSummary {
  totalVotes: number
  weightsFor: number
  weightsAgainst: number
  weightsAbstain: number
  percentFor?: number
  percentAgainst?: number
}

export type VoteChoice = 'for' | 'against' | 'abstain'

export interface Vote {
  id: string
  proposalId: string
  voter: string
  choice: VoteChoice
  weight: number
  /**
   * Voter's tier/role at time of vote, used to calculate weight.
   * { tier: 'pro', role: 'moderator' } for example.
   */
  voterContext?: {
    tier?: MembershipTier
    role?: Role
  }
  votedAt: string
}

export interface GovernanceApi {
  // ── Member queries (read-only) ────────────────────────────────────────
  /**
   * List active and recent proposals.
   * @param filter - Optional filter by status ('active', 'draft', 'closed', 'resolved') or type
   * @param limit - Pagination limit (default 20)
   * @param cursor - Pagination cursor
   */
  listProposals(params?: {
    filter?: ProposalStatus | ProposalType
    limit?: number
    cursor?: string
  }, signal?: AbortSignal): Promise<Proposal[]>

  /**
   * Get a single proposal by ID with full details and vote summary.
   */
  getProposal(id: string, signal?: AbortSignal): Promise<Proposal | null>

  /**
   * Get the authenticated member's vote on a proposal (if any).
   */
  getMemberVote(proposalId: string, signal?: AbortSignal): Promise<Vote | null>

  /**
   * List all votes on a proposal (for transparency).
   */
  listProposalVotes(proposalId: string, params?: {
    limit?: number
    cursor?: string
  }, signal?: AbortSignal): Promise<Vote[]>

  // ── Member mutations ──────────────────────────────────────────────────
  /**
   * Cast or update a vote on an active proposal.
   * Requires SIWE authentication. The voter's weight is determined by their
   * tier/role at the time of voting (or mock-determined in demo).
   * Throws 403 if voting is not open, 404 if proposal not found.
   */
  castVote(proposalId: string, choice: VoteChoice): Promise<Vote>

  // ── Admin mutations ───────────────────────────────────────────────────
  /**
   * Create a new governance proposal (admin only).
   * Initially in 'draft' status; must call publishProposal() to activate.
   */
  createProposal(proposal: Omit<Proposal, 'id' | 'createdAt' | 'status' | 'communityId' | 'votesSummary' | 'totalWeight'>): Promise<Proposal>

  /**
   * Update a proposal (admin only, must be in draft or closed status).
   */
  updateProposal(id: string, updates: Partial<Omit<Proposal, 'id' | 'status' | 'proposer' | 'createdAt' | 'votesSummary' | 'totalWeight'>>): Promise<Proposal>

  /**
   * Publish a draft proposal, transitioning it to 'active' and opening voting.
   * Admin only.
   */
  publishProposal(id: string): Promise<Proposal>

  /**
   * Close voting on an active proposal, transitioning to 'closed'.
   * Admin only. Does not execute/resolve the outcome.
   */
  closeProposalVoting(id: string): Promise<Proposal>

  /**
   * Resolve a closed proposal by applying its outcome (e.g., update policy, add resource).
   * Admin only. This is a notification method; actual state changes happen on the backend.
   */
  resolveProposal(id: string, outcome: string): Promise<Proposal>

  /**
   * Delete a draft proposal. Admin only.
   */
  deleteProposal(id: string): Promise<void>
}

// ── API Interface ─────────────────────────────────────────────────────────────

/**
 * Read-only member and resource queries.
 * No SIWE token is required for these operations.
 */
export interface PaginatedMembers {
  members: MemberRow[]
  nextCursor?: string
}

export interface MemberAccessApi {
  // ── Read-only (no auth token required) ──────────────────────────────────
  getSession(signal?: AbortSignal): Promise<Session>
  getCommunity(signal?: AbortSignal): Promise<Community>
  getMembership(address: string, signal?: AbortSignal): Promise<Membership | null>
  verifyWallet(address: string, signal?: AbortSignal): Promise<WalletVerification>
  getProfile(address: string, signal?: AbortSignal): Promise<MemberProfile | null>
  listMembers(params?: { cursor?: string; limit?: number; filter?: string }, signal?: AbortSignal): Promise<MemberRow[] | PaginatedMembers>
  listResources(signal?: AbortSignal): Promise<Resource[]>
  listPolicies(signal?: AbortSignal): Promise<AccessPolicy[]>
  getResource(id: string, signal?: AbortSignal): Promise<ResourceLookupResult>
  getPolicy(resourceId: string, signal?: AbortSignal): Promise<AccessPolicy | null>
  /**
   * Updates the caller's own profile (display name, bio, avatar, social
   * links). The one mutation on this interface: unlike the rest of
   * {@link MemberAccessApi} it requires a SIWE bearer token, but reuses the
   * existing member/admin SIWE session rather than a separate auth
   * mechanism — the backend must reject the request unless the token's
   * address matches \`profile.address\`. \`badges\` is system-assigned and is
   * not settable through this method.
   */
  updateProfile(profile: MemberProfile): Promise<void>

  /**
   * Fetch backend metadata including the API contract version.
   * Used by the startup version-compatibility check.
   */
  getMeta(signal?: AbortSignal): Promise<MetaResponse>

  // ── Social Graph (Connections / Blocks) ──
  getConnections(address: string, signal?: AbortSignal): Promise<Connection[]>
  getPrivacySettings(address: string, signal?: AbortSignal): Promise<MemberPrivacySettings>
  updatePrivacySettings(address: string, settings: MemberPrivacySettings): Promise<void>
  blockMember(targetAddress: string): Promise<void>
  unblockMember(targetAddress: string): Promise<void>
  createConnectionRequest(targetAddress: string): Promise<void>
  acceptConnectionRequest(targetAddress: string): Promise<void>
  rejectConnectionRequest(targetAddress: string): Promise<void>
}

export interface RoleDistributionEntry {
  role: Role
  count: number
}

/**
 * Analytics surface exposed on {@link AdminAccessApi}. Both LiveAccessApi
 * and MockAccessApi implement this as a plain object of async methods
 * (see lib/api/live.ts / lib/api/mock.ts's \`analytics\` field).
 */
export interface AnalyticsDataSource {
  getMembershipTrend(signal?: AbortSignal): Promise<MemberGrowthDataPoint[]>
  getRoleDistribution(signal?: AbortSignal): Promise<RoleDistributionEntry[]>
  getAccessAttempts(signal?: AbortSignal): Promise<ResourceAccessCount[]>
}

/**
 * Authenticated admin queries and mutations.
 * These methods require a valid SIWE token context.
 */
export interface AdminAccessApi {
  // ── Admin queries & mutations (require a valid SIWE token context) ────────
  listWebhookEvents(signal?: AbortSignal): Promise<WebhookEventLog[]>
  /** Paginated/filterable variant of listWebhookEvents used by app/admin/events. */
  listAdminEvents(params?: AdminEventFilterParams): Promise<Paginated<WebhookEvent>>
  /**
   * Subscribe to the admin webhook event stream.
   *
   * @provisional Live mode attempts \`GET /v1/admin/events/stream\` as an
   * SSE-compatible stream. If setup fails, the caller should fall back to
   * \`listWebhookEvents()\` polling.
   */
  subscribeWebhookEvents(
    onEvent: (event: WebhookEventLog) => void,
    onError?: (error: unknown) => void,
  ): WebhookEventUnsubscribe
  /**
   * Fetch the analytics summary for the admin dashboard.
   *
   * @provisional Calls \`GET /v1/admin/analytics\` — endpoint not yet live in
   * guildpass-core. Contract tracked in issue #157; pending backend confirmation.
   */
  getPendingActions(): Promise<PendingAction[]>
  approveAction(id: string): Promise<void>
  rejectAction(id: string): Promise<void>
  updateApprovalConfig(config: ApprovalConfig): Promise<void>

  assignRole(address: string, role: Role): Promise<MutationResult>
  removeRole(address: string, role: Role): Promise<MutationResult>
  updatePolicy(policy: AccessPolicy): Promise<MutationResult>

  // ── Moderation Queue ──
  listReports(signal?: AbortSignal): Promise<ModerationReport[]>
  getReport(id: string, signal?: AbortSignal): Promise<ModerationReport | null>
  updateReportState(id: string, state: ModerationState, updates?: Partial<ModerationReport>): Promise<void>

  // ── Governance (requires SIWE auth for voting/proposals) ──
  listProposals(params?: { filter?: ProposalStatus | ProposalType; limit?: number; cursor?: string }, signal?: AbortSignal): Promise<Proposal[]>
  getProposal(id: string, signal?: AbortSignal): Promise<Proposal | null>
  getMemberVote(proposalId: string, signal?: AbortSignal): Promise<Vote | null>
  listProposalVotes(proposalId: string, params?: { limit?: number; cursor?: string }, signal?: AbortSignal): Promise<Vote[]>
  castVote(proposalId: string, choice: VoteChoice): Promise<Vote>
  createProposal(proposal: Omit<Proposal, 'id' | 'createdAt' | 'status' | 'communityId' | 'votesSummary' | 'totalWeight'>): Promise<Proposal>
  updateProposal(id: string, updates: Partial<Omit<Proposal, 'id' | 'status' | 'proposer' | 'createdAt' | 'votesSummary' | 'totalWeight'>>): Promise<Proposal>
  publishProposal(id: string): Promise<Proposal>
  closeProposalVoting(id: string): Promise<Proposal>
  resolveProposal(id: string, outcome: string): Promise<Proposal>
  deleteProposal(id: string): Promise<void>

  // Analytics
  analytics: AnalyticsDataSource
}

/**
 * Lightweight session-status check for httpOnly-cookie auth mode (dual-mode
 * readiness — see docs/http-only-cookie-migration.md). Never carries a
 * bearer token; \`authenticated\` is the only field guaranteed present.
 *
 * @provisional \`GET /v1/auth/session\` is not yet implemented in
 * guildpass-core. This contract lets the frontend cookie-mode path be built
 * and tested against the mock ahead of the backend endpoint shipping.
 */
export interface SessionStatus {
  authenticated: boolean
  address?: string
  expiresAt?: string
}

export const SessionStatusSchema = z.object({
  authenticated: z.boolean(),
  address: z.string().optional(),
  expiresAt: z.string().optional(),
})

/**
 * SIWE authentication endpoints.
 */
export interface SiweAuthApi {
  // ── SIWE authentication endpoints ────────────────────────────────────────
  /** Fetch a one-time nonce for the given address to include in the SIWE message. */
  getNonce(address: string): Promise<string>
  /**
   * Submit a signed EIP-4361 message and receive an authenticated session
   * token. The backend verifies the signature and returns a short-lived access
   * token plus a longer-lived refresh token.
   */
  siweVerify(message: string, signature: string): Promise<SiweAuthSession>
  /**
   * Exchange a valid refresh token for a fresh access token (and a new
   * refresh token — token rotation). The caller must immediately persist the
   * returned session and discard the old refresh token.
   *
   * Throws a 401 ApiError when the refresh token is expired or invalid,
   * signalling that the user must re-sign with their wallet.
   */
  siweRefresh(refreshToken: string): Promise<SiweAuthSession>
  /**
   * Invalidate the current server-side session (no-op for stateless JWTs).
   * \`token\` is optional so cookie-auth-mode callers — which never hold a
   * bearer token — can invoke this with no argument; the session cookie
   * identifies the caller instead.
   */
  siweLogout(token?: string): Promise<void>
  verifyWallet(address: string): Promise<WalletVerification>
  /**
   * Lightweight session-status check for httpOnly-cookie auth mode. Returns
   * \`{ authenticated: false }\` for "no session" (never throws for that
   * case); network/server errors propagate so the caller can distinguish an
   * unreachable backend from a genuinely absent session.
   *
   * @provisional See {@link SessionStatus}.
   */
  getSessionStatus(signal?: AbortSignal): Promise<SessionStatus>
}

/**
 * Composed client-side API contract.
 *
 * Built from {@link MemberAccessApi}, {@link AdminAccessApi}, and
 * {@link SiweAuthApi} so each surface has a single, unambiguous responsibility
 * and implementations cannot drift between duplicated declarations.
 */
export type AccessApi = MemberAccessApi & AdminAccessApi & SiweAuthApi
`;

function getTsType(propSchema) {
  if (propSchema.$ref) {
    return propSchema.$ref.split('/').pop();
  }

  if (propSchema.enum) {
    return propSchema.enum
      .map((val) => (typeof val === 'string' ? `'${val}'` : val))
      .join(' | ');
  }

  if (propSchema.additionalProperties) {
    return 'Record<string, unknown>';
  }

  switch (propSchema.type) {
    case 'string':
      return 'string';
    case 'boolean':
      return 'boolean';
    case 'integer':
    case 'number':
      return 'number';
    case 'array':
      return `${getTsType(propSchema.items)}[]`;
    case 'object':
      if (propSchema.properties) {
        const props = Object.entries(propSchema.properties).map(([name, schema]) => {
          const isRequired =
            propSchema.required && propSchema.required.includes(name);
          return `${name}${isRequired ? '' : '?'}: ${getTsType(schema)}`;
        });
        return `{ ${props.join('; ')} }`;
      }
      return 'Record<string, unknown>';
    default:
      if (propSchema.type !== undefined) {
        throw new Error(`Unsupported OpenAPI schema type: ${propSchema.type}`);
      }
      return 'any';
  }
}

function getZodType(propSchema) {
  if (propSchema.$ref) {
    const refName = propSchema.$ref.split('/').pop();
    return `${refName}Schema`;
  }

  if (propSchema.enum) {
    if (propSchema.enum.length === 1 && propSchema.enum[0] === true) {
      return `z.literal(true)`;
    }
    const vals = propSchema.enum
      .map((val) => (typeof val === 'string' ? `'${val}'` : val))
      .join(', ');
    return `z.enum([${vals}])`;
  }

  if (propSchema.additionalProperties) {
    return 'z.record(z.unknown())';
  }

  switch (propSchema.type) {
    case 'string':
      return 'z.string()';
    case 'boolean':
      return 'z.boolean()';
    case 'integer':
    case 'number':
      return 'z.number()';
    case 'array':
      return `z.array(${getZodType(propSchema.items)})`;
    case 'object':
      if (propSchema.properties) {
        const props = Object.entries(propSchema.properties).map(([name, schema]) => {
          const isRequired =
            propSchema.required && propSchema.required.includes(name);
          const zType = getZodType(schema);
          return `${name}: ${zType}${isRequired ? '' : '.optional()'}`;
        });
        return `z.object({ ${props.join(', ')} })`;
      }
      return 'z.record(z.unknown())';
    default:
      return 'z.any()';
  }
}

// Schemas whose canonical definition lives in STATIC_SUFFIX rather than openapi.json.
const STATIC_SCHEMA_NAMES = new Set([
  'ApiErrorBody',
  'WalletVerification',
  'WebhookEventLog',
  'WebhookEventStatus',
  'WebhookEventType',
  'WebhookPayloadSummary',
]);

/**
 * Compute a deterministic SHA-256 hash over the structural parts of the
 * schema (paths and components.schemas) that represent the actual API
 * contract shape. Metadata fields (info, x-*) are excluded so that only
 * meaningful schema changes affect the hash.
 */
function computeSchemaHash(schema) {
  const structural = {
    paths: schema.paths,
    schemas: schema.components?.schemas,
  }
  const normalized = JSON.stringify(structural, Object.keys(structural).sort())
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16)
}

function generateTypes(schema) {
  if (!schema) {
    const rawSchema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    schema = JSON.parse(rawSchema);
  }
  const schemasObj = schema.components.schemas;

  const contractVersion = (schema.info && schema.info.version) ? schema.info.version : '0.0.0-unknown'

  let output = `/**
 * This file was auto-generated from the OpenAPI schema.
 * DO NOT EDIT THIS FILE DIRECTLY.
 * To update these types, edit test/fixtures/openapi.json and run:
 *   npm run sync-types
 */

import { z } from 'zod';
import { ApiError } from './errors'

/**
 * The API contract version this frontend build expects the backend to
 * implement. Generated from test/fixtures/openapi.json info.version.
 */
export const EXPECTED_API_VERSION = "${contractVersion}"

export type ResourceLookupResult =
  | { status: 'found'; data: Resource; source: 'direct' | 'fallback' }
  | { status: 'not_found' }
  | { status: 'error'; error: ApiError }

`;

  for (const [schemaName, schemaVal] of Object.entries(schemasObj)) {
    if (!STATIC_SCHEMA_NAMES.has(schemaName)) {
      if (schemaVal.enum) {
        const enumVals = schemaVal.enum
          .map((v) => (typeof v === 'string' ? `'${v}'` : v))
          .join(' | ');
        output += `export type ${schemaName} = ${enumVals}\n\n`;
      } else if (schemaVal.oneOf) {
        const variants = schemaVal.oneOf.map((variant) => getTsType(variant));
        output += `export type ${schemaName} =\n  | ${variants.join('\n  | ')}\n\n`;
      } else if (schemaVal.type === 'object') {
        output += `export interface ${schemaName} {\n`;
        const props = schemaVal.properties || {};
        for (const [propName, propVal] of Object.entries(props)) {
          const isRequired =
            schemaVal.required && schemaVal.required.includes(propName);
          const tsType = getTsType(propVal);
          output += `  ${propName}${isRequired ? '' : '?'}: ${tsType}\n`;
        }
        output += `}\n\n`;
      }
    }

    if (schemaVal.enum) {
      if (schemaVal.enum.length === 1 && schemaVal.enum[0] === true) {
        output += `export const ${schemaName}Schema = z.literal(true)\n\n`;
      } else {
        const enumVals = schemaVal.enum
          .map((v) => (typeof v === 'string' ? `'${v}'` : v))
          .join(', ');
        output += `export const ${schemaName}Schema = z.enum([${enumVals}])\n\n`;
      }
    } else if (schemaVal.oneOf) {
      // z.lazy so union schemas may reference themselves recursively (e.g.
      // AccessRule's and/or variants contain nested AccessRule arrays).
      const variants = schemaVal.oneOf.map((variant) => getZodType(variant));
      output += `export const ${schemaName}Schema: z.ZodType<${schemaName}> = z.lazy(() =>\n  z.union([\n    ${variants.join(',\n    ')},\n  ]),\n)\n\n`;
    } else if (schemaVal.type === 'object') {
      output += `export const ${schemaName}Schema = z.object({\n`;
      const props = schemaVal.properties || {};
      for (const [propName, propVal] of Object.entries(props)) {
        const isRequired =
          schemaVal.required && schemaVal.required.includes(propName);
        const zType = getZodType(propVal);
        output += `  ${propName}: ${zType}${isRequired ? '' : '.optional()'},\n`;
      }
      output += `})\n\n`;
    }
  }

  output += STATIC_SUFFIX.trim() + '\n';
  return output;
}

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes('--check');
  const isWrite = args.includes('--write');

  if (!isCheck && !isWrite) {
    console.error('Usage: node scripts/sync-api-types.js [--write | --check]');
    process.exit(1);
  }

  const rawSchema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const schema = JSON.parse(rawSchema);

  const currentHash = computeSchemaHash(schema);
  const storedHash = schema['x-schema-hash'];
  const version = schema.info?.version;

  if (!version) {
    console.error('FAIL: openapi.json is missing info.version. Please add a semver version (e.g. "1.0.0").');
    process.exit(1);
  }

  // Schema hash enforcement: if the hash changed but the stored hash
  // hasn't been updated in the file yet, the developer must also bump
  // the version. This only applies during --check, not --write (since
  // --write updates both the hash and the types file).
  if (isCheck && storedHash) {
    if (currentHash !== storedHash) {
      console.error(
        'FAIL: Schema hash changed but version was not bumped!\n' +
        `  Stored hash:  ${storedHash}\n` +
        `  Current hash: ${currentHash}\n` +
        `  Current version: ${version}\n` +
        '  Action: Bump the version in test/fixtures/openapi.json (info.version), then run:\n' +
        '    npm run sync-types'
      );
      process.exit(1);
    }
  }

  // When writing, always update the stored hash in openapi.json
  if (isWrite) {
    schema['x-schema-hash'] = currentHash;
    fs.writeFileSync(SCHEMA_PATH, JSON.stringify(schema, null, 2) + '\n', 'utf8');
    console.log(`Schema hash updated: ${currentHash}`);
  }

  const generated = generateTypes(schema);

  if (isCheck) {
    if (!fs.existsSync(TARGET_PATH)) {
      console.error(`Error: Target file ${TARGET_PATH} does not exist.`);
      process.exit(1);
    }
    const current = fs.readFileSync(TARGET_PATH, 'utf8');
    const normGen = generated.replace(/\r\n/g, '\n').trim();
    const normCur = current.replace(/\r\n/g, '\n').trim();

    if (normGen !== normCur) {
      console.error('FAIL: Type drift detected! Frontend API types do not match openapi.json schemas.');
      console.error('Please run: npm run sync-types to update.');
      process.exit(1);
    }
    console.log('SUCCESS: Frontend API types are in sync with openapi.json.');
    process.exit(0);
  }

  if (isWrite) {
    fs.writeFileSync(TARGET_PATH, generated, 'utf8');
    console.log('SUCCESS: Generated frontend API types successfully written to lib/api/types.ts.');
    process.exit(0);
  }
}

module.exports = { getTsType, generateTypes };

if (require.main === module) {
  main();
}
