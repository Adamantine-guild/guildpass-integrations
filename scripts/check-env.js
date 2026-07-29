#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

const {
  SIWE_STATEMENT_MAX_LENGTH,
  flag,
  parseApiModeFromEnv,
  resolveCoreApiUrl,
  resolveWarningThresholdSeconds,
  validateSiweStatement,
} = require('../lib/config-validation.js')
const {
  SUPPORTED_CHAIN_NAMES,
  parseConnectorNames,
  parseWalletChainNames,
  rpcEnvNameFromChainName,
  validateBrowserUrl,
} = require('../lib/wallet/validation.js')

const DEFAULT_ENV_FILE = '.env.local'
const DEFAULT_SIWE_STATEMENT = 'Sign in to GuildPass Admin'

const FEATURE_FLAGS = [
  ['NEXT_PUBLIC_FEATURE_ADMIN_POLICIES', true],
  ['NEXT_PUBLIC_FEATURE_ADMIN_SETTINGS', (mode) => mode === 'mock'],
  ['NEXT_PUBLIC_FEATURE_EVENTS', (mode) => mode === 'mock'],
  ['NEXT_PUBLIC_FEATURE_ANALYTICS', false],
  ['NEXT_PUBLIC_FEATURE_RESOURCES', true],
  ['NEXT_PUBLIC_FEATURE_GOVERNANCE', false],
  ['NEXT_PUBLIC_FEATURE_REWARDS', false],
  ['NEXT_PUBLIC_FEATURE_MULTI_COMMUNITY', false],
  ['NEXT_PUBLIC_FEATURE_PROFILES', false],
]

function printHelp() {
  console.log(`Usage: node scripts/check-env.js [--file <path>]

Validates the effective local environment before starting the dev server.
Values from the shell override values loaded from .env.local, matching Next.js
development behavior.`)
}

function parseArgs(argv) {
  let envFile = path.resolve(process.cwd(), DEFAULT_ENV_FILE)
  let explicitEnvFile = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }

    if (arg === '--file') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('--file requires a path')
      }
      envFile = path.resolve(process.cwd(), value)
      explicitEnvFile = true
      index += 1
      continue
    }

    if (arg.startsWith('--file=')) {
      envFile = path.resolve(process.cwd(), arg.slice('--file='.length))
      explicitEnvFile = true
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return { envFile, explicitEnvFile }
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function unescapeDoubleQuotedValue(value) {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

function findClosingQuote(value, quote) {
  let escaped = false

  for (let index = 1; index < value.length; index += 1) {
    const char = value[index]

    if (quote === '"' && char === '\\' && !escaped) {
      escaped = true
      continue
    }

    if (char === quote && !escaped) {
      return index
    }

    escaped = false
  }

  return -1
}

function parseDotenv(content) {
  const values = {}
  const errors = []
  const lines = content.replace(/^\uFEFF/, '').split(/\n/)

  lines.forEach((line, index) => {
    const lineNumber = index + 1
    const trimmed = line.replace(/\r$/, '').trim()

    if (!trimmed || trimmed.startsWith('#')) {
      return
    }

    const withoutExport = trimmed.startsWith('export ')
      ? trimmed.slice('export '.length).trimStart()
      : trimmed
    const match = withoutExport.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)

    if (!match) {
      errors.push(`line ${lineNumber}: expected KEY=value`)
      return
    }

    const [, key, rawValue] = match
    const value = rawValue.trim()

    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0]
      const closingIndex = findClosingQuote(value, quote)

      if (closingIndex === -1) {
        errors.push(`line ${lineNumber}: missing closing ${quote} quote for ${key}`)
        return
      }

      const remainder = value.slice(closingIndex + 1).trim()
      if (remainder && !remainder.startsWith('#')) {
        errors.push(`line ${lineNumber}: unexpected text after ${key}`)
        return
      }

      const quotedValue = value.slice(1, closingIndex)
      values[key] =
        quote === '"' ? unescapeDoubleQuotedValue(quotedValue) : quotedValue
      return
    }

    values[key] = value.replace(/\s+#.*$/, '').trim()
  })

  return { values, errors }
}

function readEnvFile(envFile, explicitEnvFile) {
  try {
    const content = fs.readFileSync(envFile, 'utf8')
    const parsed = parseDotenv(content)
    return {
      errors: [],
      file: envFile,
      missing: false,
      values: parsed.values,
      parseErrors: parsed.errors,
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {
        errors: [],
        file: envFile,
        missing: true,
        values: {},
        parseErrors: [],
      }
    }

    return {
      errors: [`Unable to read ${envFile}: ${error.message}`],
      file: envFile,
      missing: false,
      values: {},
      parseErrors: [],
    }
  }
}

function relativeEnvFile(envFile) {
  const relative = path.relative(process.cwd(), envFile)
  return relative && !relative.startsWith('..') ? relative : envFile
}

function statusLine(status, name, message, width) {
  const prefix = `${status.padEnd(4)} ${name.padEnd(width)} `
  const lines = String(message).split('\n')
  return [
    `${prefix}${lines[0] ?? ''}`,
    ...lines.slice(1).map((line) => `${' '.repeat(prefix.length)}${line}`),
  ].join('\n')
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function rawValue(env, name) {
  return env[name]
}

function isSet(env, name) {
  const value = rawValue(env, name)
  return value !== undefined && value !== ''
}

function sourceFor(name, parsedEnv, shellEnv, envFileLabel) {
  if (hasOwn(shellEnv, name)) return 'shell'
  if (hasOwn(parsedEnv, name)) return envFileLabel
  return 'default'
}

function sourceSuffix(name, parsedEnv, shellEnv, envFileLabel) {
  const source = sourceFor(name, parsedEnv, shellEnv, envFileLabel)
  return source === 'default' ? '' : ` (${source})`
}

function flagDefault(defaultValue, mode) {
  return typeof defaultValue === 'function' ? defaultValue(mode) : defaultValue
}

function describeFlag(env, name, defaultValue, mode, parsedEnv, shellEnv, envFileLabel) {
  const raw = rawValue(env, name)
  const resolved = flag(env, name, flagDefault(defaultValue, mode))

  if (raw === undefined || raw === '') {
    return `not set; defaults to ${resolved}`
  }

  if (raw !== 'true' && raw !== 'false') {
    return `set to "${raw}"; app treats this as ${resolved}${sourceSuffix(
      name,
      parsedEnv,
      shellEnv,
      envFileLabel,
    )}`
  }

  return `resolves to ${resolved}${sourceSuffix(name, parsedEnv, shellEnv, envFileLabel)}`
}

function collectResults(effectiveEnv, parsedEnv, shellEnv, envFileLabel) {
  const results = []

  function add(status, name, message) {
    results.push({ status, name, message })
  }

  function check(name, run) {
    try {
      add('OK', name, run())
    } catch (error) {
      add('FAIL', name, errorMessage(error))
    }
  }

  const mode = parseApiModeFromEnv(effectiveEnv)

  check('NEXT_PUBLIC_MOCK_MODE / NEXT_PUBLIC_DEMO_MODE', () => {
    if (rawValue(effectiveEnv, 'NEXT_PUBLIC_MOCK_MODE') === 'true') {
      return `api mode resolves to ${mode} (NEXT_PUBLIC_MOCK_MODE=true)`
    }
    if (rawValue(effectiveEnv, 'NEXT_PUBLIC_DEMO_MODE') === 'true') {
      return `api mode resolves to ${mode} (NEXT_PUBLIC_DEMO_MODE=true)`
    }
    return `api mode resolves to ${mode}`
  })

  check('NEXT_PUBLIC_CORE_API_URL', () => {
    if (mode === 'mock') {
      const apiUrl = resolveCoreApiUrl(effectiveEnv, mode)
      if (!isSet(effectiveEnv, 'NEXT_PUBLIC_CORE_API_URL')) {
        return `not set; defaults to ${apiUrl} in mock mode`
      }
      return `set; optional in mock mode${sourceSuffix(
        'NEXT_PUBLIC_CORE_API_URL',
        parsedEnv,
        shellEnv,
        envFileLabel,
      )}`
    }
    resolveCoreApiUrl(effectiveEnv, mode)
    return `valid URL${sourceSuffix(
      'NEXT_PUBLIC_CORE_API_URL',
      parsedEnv,
      shellEnv,
      envFileLabel,
    )}`
  })

  check('NEXT_PUBLIC_SIWE_DOMAIN', () => {
    if (!isSet(effectiveEnv, 'NEXT_PUBLIC_SIWE_DOMAIN')) {
      return 'not set; defaults to localhost:3000'
    }
    return `configured${sourceSuffix(
      'NEXT_PUBLIC_SIWE_DOMAIN',
      parsedEnv,
      shellEnv,
      envFileLabel,
    )}`
  })

  check('NEXT_PUBLIC_SIWE_STATEMENT', () => {
    const value =
      rawValue(effectiveEnv, 'NEXT_PUBLIC_SIWE_STATEMENT') ?? DEFAULT_SIWE_STATEMENT
    const statement = validateSiweStatement(value)
    return `${statement.length}/${SIWE_STATEMENT_MAX_LENGTH} chars; single-line${sourceSuffix(
      'NEXT_PUBLIC_SIWE_STATEMENT',
      parsedEnv,
      shellEnv,
      envFileLabel,
    )}`
  })

  check('NEXT_PUBLIC_SIWE_WARNING_SECONDS / NEXT_PUBLIC_SIWE_WARNING_MINUTES', () => {
    const seconds = resolveWarningThresholdSeconds(effectiveEnv)
    const secondsValue = rawValue(effectiveEnv, 'NEXT_PUBLIC_SIWE_WARNING_SECONDS')
    const minutesValue = rawValue(effectiveEnv, 'NEXT_PUBLIC_SIWE_WARNING_MINUTES')

    if (secondsValue === undefined && minutesValue === undefined) {
      return `not set; defaults to ${seconds}s`
    }

    if (
      (secondsValue !== undefined && Number.isNaN(Number(secondsValue))) ||
      (secondsValue === undefined &&
        minutesValue !== undefined &&
        Number.isNaN(Number(minutesValue)))
    ) {
      return `non-numeric value is ignored by the app; resolves to ${seconds}s`
    }

    return `resolves to ${seconds}s`
  })

  check('INTEGRATION_ALLOWED_ORIGIN', () => {
    if (!isSet(effectiveEnv, 'INTEGRATION_ALLOWED_ORIGIN')) {
      return 'not set; optional'
    }
    return `configured${sourceSuffix(
      'INTEGRATION_ALLOWED_ORIGIN',
      parsedEnv,
      shellEnv,
      envFileLabel,
    )}`
  })

  check('NEXT_PUBLIC_API_VALIDATION_LOG_ONLY', () =>
    describeFlag(
      effectiveEnv,
      'NEXT_PUBLIC_API_VALIDATION_LOG_ONLY',
      false,
      mode,
      parsedEnv,
      shellEnv,
      envFileLabel,
    ),
  )

  for (const [name, defaultValue] of FEATURE_FLAGS) {
    check(name, () =>
      describeFlag(
        effectiveEnv,
        name,
        defaultValue,
        mode,
        parsedEnv,
        shellEnv,
        envFileLabel,
      ),
    )
  }

  let chainNames
  check('NEXT_PUBLIC_WALLET_CHAINS', () => {
    chainNames = parseWalletChainNames(rawValue(effectiveEnv, 'NEXT_PUBLIC_WALLET_CHAINS'))
    if (!isSet(effectiveEnv, 'NEXT_PUBLIC_WALLET_CHAINS')) {
      return `${chainNames.join(', ')} (default)`
    }
    return `${chainNames.join(', ')}${sourceSuffix(
      'NEXT_PUBLIC_WALLET_CHAINS',
      parsedEnv,
      shellEnv,
      envFileLabel,
    )}`
  })

  check('NEXT_PUBLIC_WALLET_CONNECTORS', () => {
    const connectorNames = parseConnectorNames(
      rawValue(effectiveEnv, 'NEXT_PUBLIC_WALLET_CONNECTORS'),
    )
    if (!isSet(effectiveEnv, 'NEXT_PUBLIC_WALLET_CONNECTORS')) {
      return `${connectorNames.join(', ')} (default)`
    }
    return `${connectorNames.join(', ')}${sourceSuffix(
      'NEXT_PUBLIC_WALLET_CONNECTORS',
      parsedEnv,
      shellEnv,
      envFileLabel,
    )}`
  })

  for (const chainName of SUPPORTED_CHAIN_NAMES) {
    const envName = rpcEnvNameFromChainName(chainName)
    check(envName, () => {
      if (!chainNames) {
        return 'skipped until NEXT_PUBLIC_WALLET_CHAINS is fixed'
      }

      if (!chainNames.includes(chainName)) {
        return isSet(effectiveEnv, envName)
          ? 'set but not used by the current chain list'
          : 'not used by the current chain list'
      }

      if (!isSet(effectiveEnv, envName)) {
        return 'not set; using wagmi default transport'
      }

      validateBrowserUrl(rawValue(effectiveEnv, envName), envName)
      return `configured; valid http(s) URL${sourceSuffix(
        envName,
        parsedEnv,
        shellEnv,
        envFileLabel,
      )}`
    })
  }

  return results
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(errorMessage(error))
    console.error('Run `npm run check-env -- --help` for usage.')
    process.exitCode = 1
    return
  }

  const loaded = readEnvFile(args.envFile, args.explicitEnvFile)
  const envFileLabel = relativeEnvFile(args.envFile)
  const effectiveEnv = { ...loaded.values, ...process.env }
  const results = []

  if (loaded.missing) {
    results.push({
      status: args.explicitEnvFile ? 'FAIL' : 'WARN',
      name: envFileLabel,
      message: args.explicitEnvFile
        ? 'file not found'
        : 'not found; copy .env.example to .env.local or provide env vars in the shell',
    })
  } else {
    results.push({
      status: 'OK',
      name: envFileLabel,
      message: 'loaded',
    })
  }

  for (const error of loaded.errors) {
    results.push({ status: 'FAIL', name: envFileLabel, message: error })
  }

  for (const error of loaded.parseErrors) {
    results.push({ status: 'FAIL', name: envFileLabel, message: error })
  }

  results.push(...collectResults(effectiveEnv, loaded.values, process.env, envFileLabel))

  const width = Math.max(...results.map((result) => result.name.length))
  console.log('GuildPass environment check')
  console.log('')
  for (const result of results) {
    console.log(statusLine(result.status, result.name, result.message, width))
  }

  const failed = results.some((result) => result.status === 'FAIL')
  console.log('')
  if (failed) {
    console.log('Environment check failed. Fix the FAIL entries above, then run npm run check-env again.')
    process.exitCode = 1
    return
  }

  console.log('Environment check passed.')
}

main()
