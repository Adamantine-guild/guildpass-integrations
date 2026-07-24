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

export type ApiMode = 'mock' | 'live'

export interface SiweConfig {
  domain: string
  statement: string
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

// ── Error type ────────────────────────────────────────────────────────────────

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function env(name: string): string | undefined {
  return process.env[name]
}

function isDev(): boolean {
  return process.env.NODE_ENV === 'development'
}

function requireEnv(name: string, message: string): string {
  const value = env(name)
  if (!value) {
    throw new ConfigError(message)
  }
  return value
}

function validateUrl(value: string, name: string): string {
  try {
    new URL(value)
    return value
  } catch {
    throw new ConfigError(`${name} must be a valid URL, got "${value}"`)
  }
}

/**
 * The EIP-4361 statement field is a single line embedded in the message the
 * user signs. Newlines/control characters would break the message format, and
 * an excessively long statement is unreadable in wallet UIs.
 */
const SIWE_STATEMENT_MAX_LENGTH = 200
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

function validateSiweStatement(value: string): string {
  if (CONTROL_CHARS.test(value)) {
    throw new ConfigError(
      'NEXT_PUBLIC_SIWE_STATEMENT must be a single line without control ' +
        'characters (no \\n, \\r, tabs, etc.) — the EIP-4361 statement field ' +
        'is single-line.',
    )
  }
  if (value.length > SIWE_STATEMENT_MAX_LENGTH) {
    throw new ConfigError(
      `NEXT_PUBLIC_SIWE_STATEMENT must be at most ${SIWE_STATEMENT_MAX_LENGTH} ` +
        `characters (got ${value.length}) so the signing message stays ` +
        'readable in wallet UIs.',
    )
  }
  return value
}

// ── Mode ──────────────────────────────────────────────────────────────────────

function parseApiMode(): ApiMode {
  const mock = env('NEXT_PUBLIC_MOCK_MODE')
  const demo = env('NEXT_PUBLIC_DEMO_MODE')
  return mock === 'true' || demo === 'true' ? 'mock' : 'live'
}

// ── Build config ──────────────────────────────────────────────────────────────

const apiMode = parseApiMode()

const apiUrl: string = (() => {
  if (apiMode === 'live') {
    const url = requireEnv(
      'NEXT_PUBLIC_CORE_API_URL',
      [
        'NEXT_PUBLIC_CORE_API_URL is required when API mode is "live".',
        '',
        '  Either set NEXT_PUBLIC_CORE_API_URL to the base URL of your',
        '  guildpass-core instance (e.g. http://localhost:4000), or set',
        '  NEXT_PUBLIC_MOCK_MODE=true for local development without a backend.',
        '',
        '  See .env.example for details.',
      ].join('\n'),
    )
    return validateUrl(url, 'NEXT_PUBLIC_CORE_API_URL')
  }
  return env('NEXT_PUBLIC_CORE_API_URL') || 'http://localhost:4000'
})()

const siwe: SiweConfig = {
  domain: env('NEXT_PUBLIC_SIWE_DOMAIN') ?? 'localhost:3000',
  statement: validateSiweStatement(
    env('NEXT_PUBLIC_SIWE_STATEMENT') ?? 'Sign in to GuildPass Admin',
  ),
}

const isMock = apiMode === 'mock'

function flag(varName: string, defaultVal: boolean): boolean {
  const val = env(varName)
  if (val === undefined || val === '') return defaultVal
  return val === 'true'
}

const integrationGateway: IntegrationGatewayConfig = {
  allowedOrigin: env('INTEGRATION_ALLOWED_ORIGIN'),
}

const features: FeatureFlags = {
  adminPolicies: flag('NEXT_PUBLIC_FEATURE_ADMIN_POLICIES', true),
  // Advanced admin tooling (community settings). Persistence is deferred for the
  // MVP, so this defaults on only in mock/demo mode and stays off in live until
  // the settings backend ships.
  adminSettings: flag('NEXT_PUBLIC_FEATURE_ADMIN_SETTINGS', isMock),
  events: flag('NEXT_PUBLIC_FEATURE_EVENTS', isMock),
  analytics: flag('NEXT_PUBLIC_FEATURE_ANALYTICS', false),
  resources: flag('NEXT_PUBLIC_FEATURE_RESOURCES', true),
  governance: flag('NEXT_PUBLIC_FEATURE_GOVERNANCE', false),
  rewards: flag('NEXT_PUBLIC_FEATURE_REWARDS', false),
  // Multi-community support is not implemented — this only reserves nav
  // space with a disabled switcher stub. Keep false in every environment
  // until real multi-community logic ships.
  multiCommunity: flag('NEXT_PUBLIC_FEATURE_MULTI_COMMUNITY', false),
  // Rich profile customization / public profile view (#254) — deferred module,
  // off in every environment (including mock) until explicitly enabled.
  profiles: flag('NEXT_PUBLIC_FEATURE_PROFILES', false),
}

export const config: AppConfig = Object.freeze({
  apiMode,
  apiUrl,
  siwe: Object.freeze(siwe),
  features: Object.freeze(features),
  integrationGateway: Object.freeze(integrationGateway),
  get apiValidationLogOnly() {
    return flag('NEXT_PUBLIC_API_VALIDATION_LOG_ONLY', false)
  },
})
