export const queryKeys = {
  // Session
  session: {
    all: ['session'] as const,
    byAddress: (address: string) => ['session', address] as const,
  },

  // Members
  members: {
    all: ['members'] as const,
  },

  // Policies
  policies: {
    all: ['policies'] as const,
    byResource: (resourceId: string) => ['policy', resourceId] as const,
  },

  // Resources
  resources: {
    all: ['resources'] as const,
    detail: (resourceId: string) => ['resource', resourceId] as const,
  },

  // Community
  community: {
    all: ['community'] as const,
  },

  // Profile
  profile: {
    all: ['profile'] as const,
    byAddress: (address: string) => ['profile', address] as const,
  },

  // Wallet Verification
  walletVerification: {
    all: ['walletVerification'] as const,
    byAddress: (address: string) => ['walletVerification', address] as const,
  },

  // Webhook Events
  webhookEvents: {
    all: ['webhookEvents'] as const,
  },

  // Analytics (admin, NEXT_PUBLIC_FEATURE_ANALYTICS)
  analytics: {
    summary: ['analytics', 'summary'] as const,
  },
}
