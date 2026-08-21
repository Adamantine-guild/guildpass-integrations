/**
 * Canonical mock API domain registry.
 *
 * Each entry is an independently parseable module under `lib/api/mock/`.
 * The aggregator (`lib/api/mock.ts`) must stay a thin composition layer so a
 * syntax error in one domain does not require editing a monolithic file.
 *
 * `requiredExports` is the stable function/value surface that other mock
 * modules and the aggregator rely on. Keep this list in lockstep with the
 * domain file's public exports.
 */
export const MOCK_API_DOMAINS = [
  {
    file: 'fixtures.ts',
    requiredExports: [
      'DEFAULT_COMMUNITY',
      'mockConnections',
      'mockPrivacySettings',
      'mockReports',
      'setMockConnections',
      'setMockPrivacySettings',
      'setMockReports',
    ],
  },
  {
    file: 'state.ts',
    requiredExports: ['communityStates', 'getCommunityState', 'initPromise'],
  },
  {
    file: 'session.ts',
    requiredExports: [
      'mockGetNonce',
      'mockGetSession',
      'mockGetSessionStatus',
      'mockSiweLogout',
      'mockSiweRefresh',
      'mockSiweVerify',
    ],
  },
  {
    file: 'core.ts',
    requiredExports: [
      'mockGetCommunity',
      'mockGetMeta',
      'mockGetPolicy',
      'mockGetResource',
      'mockListPolicies',
      'mockListResources',
      'mockVerifyWallet',
    ],
  },
  {
    file: 'members.ts',
    requiredExports: ['mockGetMembership', 'mockGetProfile', 'mockListMembers', 'mockUpdateProfile'],
  },
  {
    file: 'analytics.ts',
    requiredExports: ['buildAnalyticsDataSource', 'mockGetAnalyticsSummary'],
  },
  {
    file: 'webhooks.ts',
    requiredExports: [
      'mockListAdminEvents',
      'mockListWebhookEvents',
      'mockReplayEvent',
      'mockSubscribeWebhookEvents',
      'replayMockEvent',
    ],
  },
  {
    file: 'approvals.ts',
    requiredExports: [
      'mockApproveAction',
      'mockAssignRole',
      'mockGetPendingActions',
      'mockRejectAction',
      'mockRemoveRole',
      'mockUpdateApprovalConfig',
      'mockUpdatePolicy',
    ],
  },
  {
    file: 'social.ts',
    requiredExports: [
      'mockAcceptConnectionRequest',
      'mockBlockMember',
      'mockCreateConnectionRequest',
      'mockGetConnections',
      'mockGetPrivacySettings',
      'mockRejectConnectionRequest',
      'mockUnblockMember',
      'mockUpdatePrivacySettings',
    ],
  },
  {
    file: 'moderation.ts',
    requiredExports: ['mockGetReport', 'mockListReports', 'mockUpdateReportState'],
  },
  {
    file: 'governance.ts',
    requiredExports: [
      'mockCastVote',
      'mockCloseProposalVoting',
      'mockCreateProposal',
      'mockDeleteProposal',
      'mockGetMemberVote',
      'mockGetProposal',
      'mockListProposalVotes',
      'mockListProposals',
      'mockPublishProposal',
      'mockResolveProposal',
      'mockUpdateProposal',
    ],
  },
  {
    file: 'controls.ts',
    requiredExports: [
      'MOCK_META_VERSION_OVERRIDE',
      'setMockMetaVersion',
      'setMockResourceFetchDelay',
      'setMockResourceFetchFailure',
      'setMockRoleMutationFailure',
    ],
  },
  {
    file: 'scenarios.ts',
    requiredExports: ['applyMockScenario', 'resetMockData'],
  },
] as const

export type MockApiDomainFile = (typeof MOCK_API_DOMAINS)[number]['file']

/** Public aggregator re-exports that existing `lib/api/mock` consumers rely on. */
export const MOCK_API_PUBLIC_REEXPORTS = [
  'applyMockScenario',
  'communityStates',
  'getCommunityState',
  'MOCK_META_VERSION_OVERRIDE',
  'mockConnections',
  'mockPrivacySettings',
  'mockReports',
  'replayMockEvent',
  'resetMockData',
  'setMockMetaVersion',
  'setMockResourceFetchDelay',
  'setMockResourceFetchFailure',
  'setMockRoleMutationFailure',
] as const

/** AccessApi methods that MockAccessApi must keep implementing. */
export const MOCK_ACCESS_API_METHODS = [
  'getSession',
  'getCommunity',
  'getMembership',
  'verifyWallet',
  'getProfile',
  'listMembers',
  'listResources',
  'listPolicies',
  'getResource',
  'getPolicy',
  'updateProfile',
  'getMeta',
  'getConnections',
  'getPrivacySettings',
  'updatePrivacySettings',
  'blockMember',
  'unblockMember',
  'createConnectionRequest',
  'acceptConnectionRequest',
  'rejectConnectionRequest',
  'listWebhookEvents',
  'listAdminEvents',
  'subscribeWebhookEvents',
  'getPendingActions',
  'approveAction',
  'rejectAction',
  'updateApprovalConfig',
  'assignRole',
  'removeRole',
  'updatePolicy',
  'listReports',
  'getReport',
  'updateReportState',
  'listProposals',
  'getProposal',
  'getMemberVote',
  'listProposalVotes',
  'castVote',
  'createProposal',
  'updateProposal',
  'publishProposal',
  'closeProposalVoting',
  'resolveProposal',
  'deleteProposal',
  'getNonce',
  'siweVerify',
  'siweRefresh',
  'siweLogout',
  'getSessionStatus',
] as const
