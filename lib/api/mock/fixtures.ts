import {
  AccessPolicy,
  Community,
  Connection,
  MemberPrivacySettings,
  MemberProfile,
  Membership,
  MembershipTier,
  ModerationReport,
  Resource,
  Role,
  WebhookEventLog,
} from '../types'

export const DEFAULT_COMMUNITY: Community = {
  id: 'guildpass-demo',
  name: 'GuildPass Demo Community',
  description: 'Demo space for membership and gating',
  tiers: ['free', 'standard', 'pro'],
}

export const DEFAULT_RESOURCES: Resource[] = [
  {
    id: 'alpha',
    title: 'Alpha Docs',
    description: 'Internal docs',
    minTier: 'standard',
    content: [
      { type: 'text', body: 'Welcome to the Alpha Docs. This is a restricted area.' },
      { type: 'callout', title: 'Confidential', body: 'Do not share these documents outside the organization.', level: 'warning' },
      { type: 'markdown', body: '### Getting Started\n\n1. Clone the repo\n2. Run `npm install`' },
      { type: 'link', title: 'Internal Wiki', url: 'https://wiki.internal' }
    ]
  },
  {
    id: 'pro-reports',
    title: 'Pro Reports',
    description: 'Advanced insight',
    minTier: 'pro',
    content: [
      { type: 'text', body: 'Quarterly Analysis Report' },
      { type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Market Overview' },
      { type: 'file', title: 'Q3_Data.csv', url: '/files/q3_data.csv' }
    ]
  },
  { id: 'mem-updates', title: 'Member Updates', description: 'Community updates', minTier: 'free' },
]

export const DEFAULT_POLICIES: AccessPolicy[] = [
  { resourceId: 'alpha', minTier: 'standard', updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() },
  { resourceId: 'pro-reports', minTier: 'pro', updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString() },
  { resourceId: 'mem-updates', minTier: 'free', updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString() },
  // Composable-rule demos. Legacy minTier/roles fields are kept as the closest
  // single-condition approximation for older clients; `rule` is authoritative.
  {
    // Moderator Lounge: standard tier AND the moderator role.
    resourceId: 'mod-lounge',
    minTier: 'standard',
    roles: ['moderator'],
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    rule: {
      type: 'and',
      rules: [
        { type: 'tier', minTier: 'standard' },
        { type: 'role', role: 'moderator' },
      ],
    },
  },
  {
    // Insider Hub: pro tier OR the "Early Member" badge.
    resourceId: 'insider-hub',
    minTier: 'pro',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    rule: {
      type: 'or',
      rules: [
        { type: 'tier', minTier: 'pro' },
        { type: 'badge', badge: 'Early Member' },
      ],
    },
  },
]

export const DEFAULT_WEBHOOK_EVENTS: WebhookEventLog[] = [
  {
    id: "wh_01J1",
    eventType: "membership.created",
    status: "success",
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    affectedIdentifier: "0x71C...3A90",
    payloadSummary: { network: "ethereum", txHash: "0xabc...123", tier: "pro" },
    fullPayload: {
      event: "membership.created",
      data: {
        address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976A",
        tier: "pro",
        timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      },
      metadata: {
        network: "ethereum",
        txHash: "0xabc123def456abc123def456abc123def456abc123def456abc123def456abc123",
        blockNumber: 19548291,
      },
    },
  },
  {
    id: "wh_01J2",
    eventType: "membership.expired",
    status: "success",
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    affectedIdentifier: "0x94F...8B21",
    payloadSummary: { reason: "Subscription term elapsed" },
    fullPayload: {
      event: "membership.expired",
      data: {
        address: "0x94F68E164F64B8A2E2B9E7B1A3Ec5E7E3d8eB2A1",
        tier: "standard",
        expiresAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      },
      metadata: {
        reason: "Subscription term elapsed",
        gracePeriodDays: 7,
      },
    },
  },
  {
    id: "wh_01J3",
    eventType: "tier.upgraded",
    status: "failed",
    timestamp: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    affectedIdentifier: "0xF39...2441",
    payloadSummary: { network: "ethereum", reason: "Gas limit hit execution revert" },
    fullPayload: {
      event: "tier.upgraded",
      data: {
        address: "0xF39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        fromTier: "free",
        toTier: "standard",
      },
      metadata: {
        network: "ethereum",
        txHash: "0xdef789abc456def789abc456def789abc456def789abc456def789abc456def789",
        error: "Gas limit hit execution revert",
        gasUsed: "850000",
        gasLimit: "800000",
      },
    },
  },
]

export const DEFAULT_MEMBER_STORE: Record<string, { membership: Membership; roles: Role[]; profile: MemberProfile }> = {}

/** Deterministic name pool for seeded members — gives search-by-name something realistic and varied to match against. */
export const SEED_FIRST_NAMES = ['Ada', 'Grace', 'Alan', 'Katherine', 'Linus', 'Margaret', 'Dennis', 'Radia', 'Barbara', 'Vint', 'Hedy', 'Claude']
export const SEED_LAST_NAMES = ['Lovelace', 'Hopper', 'Turing', 'Johnson', 'Torvalds', 'Hamilton', 'Ritchie', 'Perlman', 'Liskov', 'Cerf', 'Lamarr', 'Shannon']

// Populate 50,000 synthetic members to exercise the scale scenario
for (let i = 0; i < 50000; i++) {
  const hex = (i + 1).toString(16).padStart(40, '0')
  const address = `0x${hex}`
  const tier: MembershipTier = i % 10 < 3 ? 'pro' : i % 10 < 7 ? 'standard' : 'free'
  const active = i % 5 !== 0
  // i % 777 (excluding i === 0, already 'admin') seeds a small, deterministic
  // set of multi-role members so role-filter "matches any assigned role"
  // behavior has real examples to exercise, without disturbing the existing
  // single-admin / every-50th-moderator distribution other tests rely on.
  const roles: Role[] =
    i === 0
      ? ['admin']
      : i % 777 === 0
        ? ['moderator', 'member']
        : i % 50 === 0
          ? ['moderator']
          : ['member']
  const displayName = `${SEED_FIRST_NAMES[i % SEED_FIRST_NAMES.length]} ${SEED_LAST_NAMES[Math.floor(i / SEED_FIRST_NAMES.length) % SEED_LAST_NAMES.length]}`

  DEFAULT_MEMBER_STORE[address] = {
    membership: {
      address,
      tier,
      active,
    },
    roles,
    profile: {
      address,
      displayName,
      badges: i % 100 === 0 ? ['Early Adopter'] : [],
    },
  }
}

export const MOCK_COMMUNITIES: Record<string, Community> = {
  'guildpass-demo': {
    id: 'guildpass-demo',
    name: 'GuildPass Demo Community',
    description: 'Demo space for membership and gating',
    tiers: ['free', 'standard', 'pro'],
  },
  'builders-collective': {
    id: 'builders-collective',
    name: 'Builders Collective',
    description: 'A community for open source developers and builders.',
    tiers: ['free', 'standard', 'pro'],
  },
  'design-guild': {
    id: 'design-guild',
    name: 'Design Guild',
    description: 'A collaborative space for UX/UI designers and creators.',
    tiers: ['free', 'standard', 'pro'],
  },
  'guildpass-hub': {
    id: 'guildpass-hub',
    name: 'GuildPass Hub (Multi-Community)',
    description: 'Shared hub for a member active across several communities',
    tiers: ['free', 'standard', 'pro'],
  }
}

export const MOCK_RESOURCES: Record<string, Resource[]> = {
  'guildpass-demo': [...DEFAULT_RESOURCES],
  'builders-collective': [
    { id: 'builders-chat', title: 'Builders Chat', description: 'Collaborative builder chatroom', minTier: 'standard' },
    { id: 'builders-docs', title: 'Builders Docs', description: 'Technical documentation for builders', minTier: 'pro' },
    { id: 'builders-updates', title: 'Builders Updates', description: 'General announcements', minTier: 'free' }
  ],
  'design-guild': [
    { id: 'design-portfolio', title: 'Portfolio Reviews', description: 'Submit design portfolios for feedback', minTier: 'standard' },
    { id: 'design-assets', title: 'Design Asset Library', description: 'UI kits, icons, and premium resources', minTier: 'pro' }
  ],
  'guildpass-hub': []
}

export const MOCK_POLICIES: Record<string, AccessPolicy[]> = {
  'guildpass-demo': [...DEFAULT_POLICIES],
  'builders-collective': [
    { resourceId: 'builders-chat', minTier: 'standard', updatedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString() },
    { resourceId: 'builders-docs', minTier: 'pro', updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString() },
    { resourceId: 'builders-updates', minTier: 'free', updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() }
  ],
  'design-guild': [
    { resourceId: 'design-portfolio', minTier: 'standard', updatedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString() },
    { resourceId: 'design-assets', minTier: 'pro', updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString() }
  ],
  'guildpass-hub': []
}

export const MOCK_MEMBER_STORES: Record<string, Record<string, { membership: Membership; roles: Role[]; profile: MemberProfile }>> = {
  'guildpass-demo': { ...DEFAULT_MEMBER_STORE },
  'builders-collective': {
    '0x1234567890123456789012345678901234567890': {
      membership: { address: '0x1234567890123456789012345678901234567890', tier: 'standard', active: true },
      roles: ['member'],
      profile: { address: '0x1234567890123456789012345678901234567890', displayName: 'Collective Builder', badges: ['Builders Collective'] }
    }
  },
  'design-guild': {
    '0x1234567890123456789012345678901234567890': {
      membership: { address: '0x1234567890123456789012345678901234567890', tier: 'pro', active: true },
      roles: ['member'],
      profile: { address: '0x1234567890123456789012345678901234567890', displayName: 'Guild Designer', badges: ['Design Guild'] }
    }
  },
  'guildpass-hub': {
    '0x1234567890123456789012345678901234567890': {
      membership: { address: '0x1234567890123456789012345678901234567890', tier: 'standard', active: true },
      roles: ['member'],
      profile: {
        address: '0x1234567890123456789012345678901234567890',
        displayName: 'Multi-Community Member',
        badges: ['GuildPass Demo Community', 'Builders Collective', 'Design Guild']
      }
    }
  }
}

/**
 * Mutable social-graph / moderation state seeded with fixture data.
 *
 * These are top-level `let` bindings, exactly as before the domain split.
 * Reassignment must stay inside this module (ESM module semantics forbid
 * reassigning an imported binding), so mutation helpers are exported for
 * the modules that own each domain; plain property/content mutations
 * (e.g. `mockPrivacySettings[addr] = …`) remain safe from anywhere.
 */
export let mockConnections: Connection[] = [
  {
    id: 'conn-1',
    fromAddress: '0x1234567890123456789012345678901234567890',
    toAddress: '0x3333333333333333333333333333333333333333',
    status: 'accepted',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'conn-2',
    fromAddress: '0x1234567890123456789012345678901234567890',
    toAddress: '0x4444444444444444444444444444444444444444',
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export let mockPrivacySettings: Record<string, MemberPrivacySettings> = {};

export let mockReports: ModerationReport[] = [
  {
    id: 'rep-1',
    reporterAddress: '0x3333333333333333333333333333333333333333',
    reportedAddress: '0x1234567890123456789012345678901234567890',
    reason: 'Spamming connection requests',
    details: 'Received 15 pending requests in 10 minutes.',
    state: 'report_submitted',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString()
  }
];

/** Reassign the connection store (owning module only — see note above). */
export function setMockConnections(next: Connection[]): void {
  mockConnections = next
}

/** Reassign the privacy-settings store (owning module only — see note above). */
export function setMockPrivacySettings(next: Record<string, MemberPrivacySettings>): void {
  mockPrivacySettings = next
}

/** Reassign the reports store (owning module only — see note above). */
export function setMockReports(next: ModerationReport[]): void {
  mockReports = next
}
