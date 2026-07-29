const SIWE_STATEMENT_MAX_LENGTH = 200
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

class ConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ConfigError'
  }
}

function env(source, name) {
  return source[name]
}

function parseApiModeFromEnv(source = process.env) {
  const mock = env(source, 'NEXT_PUBLIC_MOCK_MODE')
  const demo = env(source, 'NEXT_PUBLIC_DEMO_MODE')
  return mock === 'true' || demo === 'true' ? 'mock' : 'live'
}

/**
 * 'cookie' only when explicitly requested; any other value (including unset
 * or a typo) falls back to 'bearer' so the frontend never silently drops
 * bearer-token auth in a misconfigured environment.
 */
function parseAuthModeFromEnv(source = process.env) {
  return env(source, 'NEXT_PUBLIC_AUTH_MODE') === 'cookie' ? 'cookie' : 'bearer'
}

function coreApiUrlRequiredMessage() {
  return [
    'NEXT_PUBLIC_CORE_API_URL is required when API mode is "live".',
    '',
    '  Either set NEXT_PUBLIC_CORE_API_URL to the base URL of your',
    '  guildpass-core instance (e.g. http://localhost:4000), or set',
    '  NEXT_PUBLIC_MOCK_MODE=true for local development without a backend.',
    '',
    '  See .env.example for details.',
  ].join('\n')
}

function requireEnv(source, name, message) {
  const value = env(source, name)
  if (!value) {
    throw new ConfigError(message)
  }
  return value
}

function validateUrl(value, name) {
  try {
    new URL(value)
    return value
  } catch {
    throw new ConfigError(`${name} must be a valid URL, got "${value}"`)
  }
}

function resolveCoreApiUrl(source = process.env, apiMode = parseApiModeFromEnv(source)) {
  if (apiMode === 'live') {
    const url = requireEnv(
      source,
      'NEXT_PUBLIC_CORE_API_URL',
      coreApiUrlRequiredMessage(),
    )
    return validateUrl(url, 'NEXT_PUBLIC_CORE_API_URL')
  }

  return env(source, 'NEXT_PUBLIC_CORE_API_URL') || 'http://localhost:4000'
}

function validateSiweStatement(value) {
  if (CONTROL_CHARS.test(value)) {
    throw new ConfigError(
      'NEXT_PUBLIC_SIWE_STATEMENT must be a single line without control ' +
        'characters (no \\n, \\r, tabs, etc.) - the EIP-4361 statement field ' +
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

function resolveWarningThresholdSeconds(source = process.env) {
  const warningMinutesEnv = env(source, 'NEXT_PUBLIC_SIWE_WARNING_MINUTES')
  const warningSecondsEnv = env(source, 'NEXT_PUBLIC_SIWE_WARNING_SECONDS')
  const warningThresholdSeconds = warningSecondsEnv
    ? Number(warningSecondsEnv)
    : warningMinutesEnv
      ? Number(warningMinutesEnv) * 60
      : 120

  return Number.isNaN(warningThresholdSeconds) ? 120 : warningThresholdSeconds
}

function flag(source, varName, defaultVal) {
  const val = env(source, varName)
  if (val === undefined || val === '') return defaultVal
  return val === 'true'
}

function buildFeatureFlags(source = process.env, apiMode = parseApiModeFromEnv(source)) {
  const isMock = apiMode === 'mock'

  return {
    adminPolicies: flag(source, 'NEXT_PUBLIC_FEATURE_ADMIN_POLICIES', true),
    adminSettings: flag(source, 'NEXT_PUBLIC_FEATURE_ADMIN_SETTINGS', isMock),
    events: flag(source, 'NEXT_PUBLIC_FEATURE_EVENTS', isMock),
    analytics: flag(source, 'NEXT_PUBLIC_FEATURE_ANALYTICS', false),
    resources: flag(source, 'NEXT_PUBLIC_FEATURE_RESOURCES', true),
    governance: flag(source, 'NEXT_PUBLIC_FEATURE_GOVERNANCE', false),
    rewards: flag(source, 'NEXT_PUBLIC_FEATURE_REWARDS', false),
    multiCommunity: flag(source, 'NEXT_PUBLIC_FEATURE_MULTI_COMMUNITY', false),
    profiles: flag(source, 'NEXT_PUBLIC_FEATURE_PROFILES', false),
  }
}

function buildAppConfig(source = process.env) {
  const apiMode = parseApiModeFromEnv(source)
  const authMode = parseAuthModeFromEnv(source)
  const siwe = Object.freeze({
    domain: env(source, 'NEXT_PUBLIC_SIWE_DOMAIN') ?? 'localhost:3000',
    statement: validateSiweStatement(
      env(source, 'NEXT_PUBLIC_SIWE_STATEMENT') ?? 'Sign in to GuildPass Admin',
    ),
    warningThresholdSeconds: resolveWarningThresholdSeconds(source),
  })

  return Object.freeze({
    apiMode,
    authMode,
    apiUrl: resolveCoreApiUrl(source, apiMode),
    siwe,
    features: Object.freeze(buildFeatureFlags(source, apiMode)),
    integrationGateway: Object.freeze({
      allowedOrigin: env(source, 'INTEGRATION_ALLOWED_ORIGIN'),
    }),
    get apiValidationLogOnly() {
      return flag(source, 'NEXT_PUBLIC_API_VALIDATION_LOG_ONLY', false)
    },
  })
}

module.exports = {
  ConfigError,
  SIWE_STATEMENT_MAX_LENGTH,
  CONTROL_CHARS,
  buildAppConfig,
  buildFeatureFlags,
  coreApiUrlRequiredMessage,
  flag,
  parseApiModeFromEnv,
  parseAuthModeFromEnv,
  resolveCoreApiUrl,
  resolveWarningThresholdSeconds,
  validateSiweStatement,
  validateUrl,
}
