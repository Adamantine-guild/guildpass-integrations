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
  badges: [],
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
}

export const resources = [
  resource,
  {
    id: 'pro-reports',
    title: 'Pro Reports',
    description: 'Advanced insight',
    min_tier: 'pro',
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
]

export const nonce = { nonce: 'aabbccdd11223344' }

export const siweVerify = {
  token: 'live-jwt-abcdef123456',
  address: '0xabc',
  expiresAt: '2025-12-31T00:00:00.000Z',
}
