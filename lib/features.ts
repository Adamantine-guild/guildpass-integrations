import { config } from './config'

export type FeatureFlags = {
  adminPolicies: boolean
  events: boolean
  analytics: boolean
  resources: boolean
  governance: boolean
}

export const features: FeatureFlags = { ...config.features }
