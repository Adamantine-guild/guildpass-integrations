import { config } from './config'

export type FeatureFlags = {
  adminPolicies: boolean
  adminSettings: boolean
  events: boolean
  analytics: boolean
  resources: boolean
  governance: boolean
  rewards: boolean
  multiCommunity: boolean
}

export type FeatureFlagKey = keyof FeatureFlags

export type FeatureRollout = {
  enabled: boolean
  key: FeatureFlagKey
  rolloutPercentage?: number
}

export type FeatureGateEnabled = boolean | FeatureRollout

const FEATURE_ENV: Record<FeatureFlagKey, string> = {
  adminPolicies: 'NEXT_PUBLIC_FEATURE_ADMIN_POLICIES',
  adminSettings: 'NEXT_PUBLIC_FEATURE_ADMIN_SETTINGS',
  events: 'NEXT_PUBLIC_FEATURE_EVENTS',
  analytics: 'NEXT_PUBLIC_FEATURE_ANALYTICS',
  resources: 'NEXT_PUBLIC_FEATURE_RESOURCES',
  governance: 'NEXT_PUBLIC_FEATURE_GOVERNANCE',
  rewards: 'NEXT_PUBLIC_FEATURE_REWARDS',
  multiCommunity: 'NEXT_PUBLIC_FEATURE_MULTI_COMMUNITY',
}

function rolloutEnvName(key: FeatureFlagKey): string {
  return `${FEATURE_ENV[key]}_ROLLOUT_PCT`
}

function env(name: string): string | undefined {
  return process.env[name]
}

export function parseRolloutPercentage(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined

  const pct = Number(value)
  if (!Number.isFinite(pct)) return undefined

  return Math.max(0, Math.min(100, Math.trunc(pct)))
}

export function featureBucket(identifier: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < identifier.length; i += 1) {
    hash ^= identifier.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % 100
}

export function getFeatureRollout(key: FeatureFlagKey): FeatureRollout {
  return {
    enabled: features[key],
    key,
    rolloutPercentage: parseRolloutPercentage(env(rolloutEnvName(key))),
  }
}

export function isFeatureEnabled(
  flag: FeatureGateEnabled,
  identifier?: string | null,
): boolean {
  if (typeof flag === 'boolean') return flag
  if (flag.rolloutPercentage === undefined) return flag.enabled
  if (!identifier) return false

  return featureBucket(`${flag.key}:${identifier.toLowerCase()}`) < flag.rolloutPercentage
}

export function isFeatureEnabledForIdentifier(
  key: FeatureFlagKey,
  identifier?: string | null,
): boolean {
  return isFeatureEnabled(getFeatureRollout(key), identifier)
}

export const features: FeatureFlags = { ...config.features }

export const featureRollouts: Record<FeatureFlagKey, FeatureRollout> = {
  adminPolicies: getFeatureRollout('adminPolicies'),
  adminSettings: getFeatureRollout('adminSettings'),
  events: getFeatureRollout('events'),
  analytics: getFeatureRollout('analytics'),
  resources: getFeatureRollout('resources'),
  governance: getFeatureRollout('governance'),
  rewards: getFeatureRollout('rewards'),
  multiCommunity: getFeatureRollout('multiCommunity'),
}
