export type EnvSource = Record<string, string | undefined>

export type ApiMode = 'mock' | 'live'

export interface SiweConfig {
  domain: string
  statement: string
  warningThresholdSeconds: number
}

export type FeatureFlagKey =
  | 'adminPolicies'
  | 'adminSettings'
  | 'events'
  | 'analytics'
  | 'resources'
  | 'governance'
  | 'rewards'
  | 'multiCommunity'
  | 'profiles'

export type FeatureFlags = Record<FeatureFlagKey, boolean>

export interface IntegrationGatewayConfig {
  allowedOrigin?: string
}

export interface AppConfig {
  apiMode: ApiMode
  apiUrl: string
  siwe: SiweConfig
  features: FeatureFlags
  integrationGateway: IntegrationGatewayConfig
  apiValidationLogOnly: boolean
}

export class ConfigError extends Error {
  constructor(message: string)
}

export const SIWE_STATEMENT_MAX_LENGTH: 200
export const CONTROL_CHARS: RegExp

export function buildAppConfig(source?: EnvSource): AppConfig
export function buildFeatureFlags(
  source?: EnvSource,
  apiMode?: ApiMode,
): FeatureFlags
export function coreApiUrlRequiredMessage(): string
export function flag(source: EnvSource, varName: string, defaultVal: boolean): boolean
export function parseApiModeFromEnv(source?: EnvSource): ApiMode
export function resolveCoreApiUrl(source?: EnvSource, apiMode?: ApiMode): string
export function resolveWarningThresholdSeconds(source?: EnvSource): number
export function validateSiweStatement(value: string): string
export function validateUrl(value: string, name: string): string
