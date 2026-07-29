const { ConfigError } = require('../config-validation.js')

const DEFAULT_CHAIN_NAMES = Object.freeze(['mainnet', 'base', 'sepolia'])
const SUPPORTED_CHAIN_NAMES = DEFAULT_CHAIN_NAMES
const SUPPORTED_CONNECTOR_NAMES = Object.freeze(['injected'])
const CONNECTOR_DOCS_URL =
  'https://github.com/Adamantine-Guild/guildpass-integrations#wallet-connectors'

function splitCsv(value) {
  return (
    value
      ?.split(',')
      .map((part) => part.trim())
      .filter(Boolean) ?? []
  )
}

function fail(message) {
  throw new ConfigError(message)
}

function unsupportedConnectorMessage(name) {
  return [
    `NEXT_PUBLIC_WALLET_CONNECTORS contains unsupported connector "${name}".`,
    '',
    `  Supported values: ${SUPPORTED_CONNECTOR_NAMES.join(', ')}.`,
    '',
    '  To add support for a new connector, see the "Wallet connectors"',
    `  section of the README (${CONNECTOR_DOCS_URL})`,
    '  and extend lib/wallet/config.ts.',
  ].join('\n')
}

function parseConnectorNames(csv) {
  const configuredNames = splitCsv(csv)
  const names = configuredNames.length > 0 ? configuredNames : ['injected']

  return names.map((name) => {
    if (!SUPPORTED_CONNECTOR_NAMES.includes(name)) {
      throw new ConfigError(unsupportedConnectorMessage(name))
    }
    return name
  })
}

function parseWalletChainNames(csv) {
  const configuredNames = splitCsv(csv)
  const names = configuredNames.length > 0 ? configuredNames : DEFAULT_CHAIN_NAMES

  const validNames = names.map((name) => {
    if (!SUPPORTED_CHAIN_NAMES.includes(name)) {
      fail(
        [
          `NEXT_PUBLIC_WALLET_CHAINS contains unsupported chain "${name}".`,
          `Supported values: ${SUPPORTED_CHAIN_NAMES.join(', ')}.`,
        ].join(' '),
      )
    }
    return name
  })

  const uniqueNames = validNames.filter(
    (name, index, all) => all.findIndex((item) => item === name) === index,
  )

  if (uniqueNames.length === 0) {
    fail('NEXT_PUBLIC_WALLET_CHAINS must include at least one supported chain.')
  }

  return uniqueNames
}

function rpcEnvNameFromChainName(name) {
  return `NEXT_PUBLIC_WALLET_RPC_${String(name).toUpperCase()}`
}

function validateBrowserUrl(value, envName) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      fail(`${envName} must use http:// or https://, got "${value}"`)
    }
    return value
  } catch (error) {
    if (error instanceof ConfigError) throw error
    fail(`${envName} must be a valid absolute RPC URL, got "${value}"`)
  }
}

function validateWalletEnv(source = process.env) {
  const chainNames = parseWalletChainNames(source.NEXT_PUBLIC_WALLET_CHAINS)
  const connectorNames = parseConnectorNames(source.NEXT_PUBLIC_WALLET_CONNECTORS)
  const rpcUrls = {}

  for (const chainName of chainNames) {
    const envName = rpcEnvNameFromChainName(chainName)
    const value = source[envName]
    rpcUrls[envName] = value ? validateBrowserUrl(value, envName) : undefined
  }

  return Object.freeze({
    chainNames: Object.freeze([...chainNames]),
    connectorNames: Object.freeze([...connectorNames]),
    rpcUrls: Object.freeze(rpcUrls),
  })
}

module.exports = {
  CONNECTOR_DOCS_URL,
  DEFAULT_CHAIN_NAMES,
  SUPPORTED_CHAIN_NAMES,
  SUPPORTED_CONNECTOR_NAMES,
  parseConnectorNames,
  parseWalletChainNames,
  rpcEnvNameFromChainName,
  splitCsv,
  unsupportedConnectorMessage,
  validateBrowserUrl,
  validateWalletEnv,
}
