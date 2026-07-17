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

export type VerificationMode = 'off' | 'warn' | 'enforce'

export interface SiweConfig {
  domain: string
  statement: string
}

export type FeatureFlagKey =
  | 'adminPolicies'
  | 'events'
  | 'analytics'
  | 'resources'
  | 'governance'

export type FeatureFlags = Record<FeatureFlagKey, boolean>

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
  /**
   * Response verification mode for signed access-policy responses.
   * - 'off' (default): No verification. Responses are processed as-is.
   * - 'warn': Verify signatures, log warnings on failure, but still process.
   * - 'enforce': Verify signatures, refuse to render gated content on failure.
   *
   * Set via NEXT_PUBLIC_RESPONSE_VERIFICATION.
   */
  responseVerification: VerificationMode
  /**
   * Ed25519 public key (hex-encoded) for verifying signed responses.
   * Required when responseVerification is 'enforce' in live mode.
   * In mock mode, the hardcoded MOCK_PUBLIC_KEY is always used.
   * Set via NEXT_PUBLIC_SIGNING_PUBLIC_KEY.
   */
  signingPublicKey?: string
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
  statement: env('NEXT_PUBLIC_SIWE_STATEMENT') ?? 'Sign in to GuildPass Admin',
}

const isMock = apiMode === 'mock'

function flag(varName: string, defaultVal: boolean): boolean {
  const val = env(varName)
  if (val === undefined || val === '') return defaultVal
  return val === 'true'
}

const features: FeatureFlags = {
  adminPolicies: flag('NEXT_PUBLIC_FEATURE_ADMIN_POLICIES', isMock),
  events: flag('NEXT_PUBLIC_FEATURE_EVENTS', isMock),
  analytics: flag('NEXT_PUBLIC_FEATURE_ANALYTICS', false),
  resources: flag('NEXT_PUBLIC_FEATURE_RESOURCES', isMock),
  governance: flag('NEXT_PUBLIC_FEATURE_GOVERNANCE', false),
}

// -- Signed Response Verification config ---------------------------------------

const validModes = ['off', 'warn', 'enforce'] as const
const rawVerificationMode = env('NEXT_PUBLIC_RESPONSE_VERIFICATION') ?? 'off'
const responseVerification: VerificationMode = validModes.includes(
  rawVerificationMode as VerificationMode,
)
  ? (rawVerificationMode as VerificationMode)
  : 'off'

const rawSigningKey = env('NEXT_PUBLIC_SIGNING_PUBLIC_KEY')
const signingPublicKey: string | undefined = rawSigningKey?.trim()
  ? rawSigningKey.trim()
  : undefined

export const config: AppConfig = Object.freeze({
  apiMode,
  apiUrl,
  siwe: Object.freeze(siwe),
  features: Object.freeze(features),
  responseVerification,
  signingPublicKey,
})
