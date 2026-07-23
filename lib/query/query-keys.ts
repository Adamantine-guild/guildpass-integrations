import { features } from '../features'

export const queryKeys = {
  // Session
  session: {
    all: ['session'] as const,
    byAddress: (address: string, community: string = 'guildpass-demo') =>
      features.multiCommunity
        ? ['session', address, community] as const
        : ['session', address] as const,
  },

  // Members
  members: {
    all: (community: string = 'guildpass-demo') =>
      features.multiCommunity
        ? ['members', community] as const
        : ['members'] as const,
  },

  // Policies
  policies: {
    all: (community: string = 'guildpass-demo') =>
      features.multiCommunity
        ? ['policies', community] as const
        : ['policies'] as const,
    byResource: (resourceId: string, community: string = 'guildpass-demo') =>
      features.multiCommunity
        ? ['policy', resourceId, community] as const
        : ['policy', resourceId] as const,
  },

  // Resources
  resources: {
    all: (community: string = 'guildpass-demo') =>
      features.multiCommunity
        ? ['resources', community] as const
        : ['resources'] as const,
    detail: (resourceId: string, community: string = 'guildpass-demo') =>
      features.multiCommunity
        ? ['resource', resourceId, community] as const
        : ['resource', resourceId] as const,
  },

  // Community
  community: {
    all: (community: string = 'guildpass-demo') =>
      features.multiCommunity
        ? ['community', community] as const
        : ['community'] as const,
  },

  // Profile
  profile: {
    all: ['profile'] as const,
    byAddress: (address: string, community: string = 'guildpass-demo') =>
      features.multiCommunity
        ? ['profile', address, community] as const
        : ['profile', address] as const,
  },

  // Wallet Verification
  walletVerification: {
    all: ['walletVerification'] as const,
    byAddress: (address: string, community: string = 'guildpass-demo') =>
      features.multiCommunity
        ? ['walletVerification', address, community] as const
        : ['walletVerification', address] as const,
  },

  // Webhook Events
  webhookEvents: {
    all: (community: string = 'guildpass-demo') =>
      features.multiCommunity
        ? ['webhookEvents', community] as const
        : ['webhookEvents'] as const,
  },

  // Analytics
  analytics: {
    summary: (community: string = 'guildpass-demo') =>
      features.multiCommunity
        ? ['analytics', 'summary', community] as const
        : ['analytics', 'summary'] as const,
  },
}
