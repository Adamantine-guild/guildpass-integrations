
// PoliciesPage
export type FeatureFlags = {
  adminPolicies: boolean
  events: boolean
  analytics: boolean
  resources: boolean
  governance: boolean
}

function flag(envVar: string, defaultValue: boolean): boolean {
  const val = process.env[envVar]
  if (val === undefined || val === '') return defaultValue
  return val === 'true'
}

const isMock =
  process.env.NEXT_PUBLIC_MOCK_MODE === 'true' ||
  process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export const features: FeatureFlags = {
  adminPolicies: flag('NEXT_PUBLIC_FEATURE_ADMIN_POLICIES', isMock),
  events: flag('NEXT_PUBLIC_FEATURE_EVENTS', isMock),
  analytics: flag('NEXT_PUBLIC_FEATURE_ANALYTICS', false),
  resources: flag('NEXT_PUBLIC_FEATURE_RESOURCES', isMock),
  governance: flag('NEXT_PUBLIC_FEATURE_GOVERNANCE', false),
}
