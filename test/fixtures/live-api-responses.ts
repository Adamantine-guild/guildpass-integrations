export const session = {
  address: '0xabc',
  roles: ['member'],
  membership: {
    address: '0xabc',
    membership_tier: 'free',
    is_active: true,
  },
  community: {
    id: 'guildpass-demo',
    name: 'GuildPass Demo Community',
    description: 'Demo space for membership and gating',
    tiers: ['free', 'standard', 'pro'],
  },
  badges: ['Early Member', 'Beta Tester'],
}

export const community = {
  id: 'guildpass-demo',
  name: 'GuildPass Demo Community',
  description: 'Demo space for membership and gating',
  tiers: ['free', 'standard', 'pro'],
}

export const membership = {
  address: '0xabc',
  membership_tier: 'free',
  is_active: true,
}

export const profile = {
  display_name: 'User 0xabc',
  badges: ['Early Member', 'Beta Tester'],
}

export const members = [
  {
    address: '0xabc',
    roles: ['member'],
    membership_tier: 'free',
    is_active: true,
  },
  {
    wallet_address: '0xdef',
    roles: ['member', 'admin'],
    membership_tier: 'standard',
    active: true,
  },
]

export const resource = {
  id: 'alpha',
  name: 'Alpha Docs',
  description: 'Internal docs',
  min_tier: 'standard',
  content: [
    { type: 'text', body: 'Welcome to the Alpha Docs. This is a restricted area.' },
    { type: 'callout', title: 'Confidential', body: 'Do not share these documents outside the organization.', level: 'warning' },
    { type: 'markdown', body: '### Getting Started\n\n1. Clone the repo\n2. Run `npm install`' },
    { type: 'link', title: 'Internal Wiki', url: 'https://wiki.internal' },
  ],
}

export const resources = [
  resource,
  {
    id: 'pro-reports',
    title: 'Pro Reports',
    description: 'Advanced insight',
    min_tier: 'pro',
    content: [
      { type: 'text', body: 'Quarterly Analysis Report' },
      { type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Market Overview' },
      { type: 'file', title: 'Q3_Data.csv', url: '/files/q3_data.csv' },
    ],
  },
  {
    id: 'mem-updates',
    title: 'Member Updates',
    description: 'Community updates',
    min_tier: 'free',
  },
]

export const policy = { resource_id: 'alpha', min_tier: 'standard' }

export const policies = [
  policy,
  { resource_id: 'pro-reports', min_tier: 'pro' },
  { resource_id: 'mem-updates', min_tier: 'free' },
  {
    resource_id: 'mod-lounge',
    min_tier: 'standard',
    roles: ['moderator'],
    rule: {
      type: 'and',
      rules: [
        { type: 'tier', minTier: 'standard' },
        { type: 'role', role: 'moderator' },
      ],
    },
  },
  {
    resource_id: 'insider-hub',
    min_tier: 'pro',
    rule: {
      type: 'or',
      rules: [
        { type: 'tier', minTier: 'pro' },
        { type: 'badge', badge: 'Early Member' },
      ],
    },
  },
]

export const nonce = { nonce: 'aabbccdd11223344' }

export const siweVerify = {
  token: 'live-jwt-abcdef123456',
  address: '0xabc',
  expiresAt: '2025-12-31T00:00:00.000Z',
}
