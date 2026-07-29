/**
 * lib/config.ts — typed, validated application configuration.
 *
 * Reads all NEXT_PUBLIC_* environment variables, validates them, and exports
 * a single frozen config object.  Invalid configuration throws eagerly at
 * module-import time so the app fails early with a clear message in
 * development rather than showing partially broken screens.
 *
 * Usage:
 *   import { config } from '@/lib/config'
 *   if (config.apiMode === 'live') { ... }
 */

import {
  ConfigError,
  buildAppConfig as buildValidatedAppConfig,
  type EnvSource,
} from './config-validation.js'

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
  /** Expected same-origin value for CSRF checks on /api/integration/* mutations */
  allowedOrigin?: string
}

export interface AppConfig {
  /** 'mock' when NEXT_PUBLIC_MOCK_MODE or NEXT_PUBLIC_DEMO_MODE is 'true', otherwise 'live' */
  apiMode: ApiMode
  /**
   * Base URL for the guildpass-core API.
   * - In mock mode: defaults to 'http://localhost:4000' if unset.
   * - In live mode: **required** — must be a valid absolute URL.
   */
  apiUrl: string
  /** SIWE message configuration (all fields have sensible defaults) */
  siwe: SiweConfig
  /** Feature flag booleans */
  features: FeatureFlags
  /** Server route-handler integration gateway security configuration */
  integrationGateway: IntegrationGatewayConfig
  /** Whether to validate API responses in log-only mode */
  apiValidationLogOnly: boolean
}

export { ConfigError }

// ── Build config ──────────────────────────────────────────────────────────────

export function buildAppConfig(source: EnvSource = process.env): AppConfig {
  return buildValidatedAppConfig(source) as AppConfig
}

export const config: AppConfig = buildAppConfig()
