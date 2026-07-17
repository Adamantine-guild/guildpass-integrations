/**
 * lib/wallet/connectors.ts
 *
 * Parsing and validation for NEXT_PUBLIC_WALLET_CONNECTORS, kept free of
 * wagmi imports so it can be unit tested. lib/wallet/config.ts maps the
 * validated names to actual wagmi connector factories.
 *
 * To add support for a new connector (e.g. walletConnect):
 *   1. Add its name to SUPPORTED_CONNECTOR_NAMES below.
 *   2. Handle it in buildConnectors() in lib/wallet/config.ts.
 *   3. Document it in README.md ("Wallet connectors") and .env.example.
 */

import { ConfigError } from '../config'

export const SUPPORTED_CONNECTOR_NAMES = ['injected'] as const

export type WalletConnectorName = (typeof SUPPORTED_CONNECTOR_NAMES)[number]

export const CONNECTOR_DOCS_URL =
  'https://github.com/Adamantine-Guild/guildpass-integrations#wallet-connectors'

export function unsupportedConnectorMessage(name: string): string {
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

/**
 * Parse the comma-separated NEXT_PUBLIC_WALLET_CONNECTORS value into a list
 * of supported connector names. Defaults to ['injected'] when unset/empty;
 * throws a ConfigError naming the offending value for anything unsupported.
 */
export function parseConnectorNames(
  csv: string | undefined,
): readonly WalletConnectorName[] {
  const configuredNames =
    csv
      ?.split(',')
      .map((part) => part.trim())
      .filter(Boolean) ?? []
  const names = configuredNames.length > 0 ? configuredNames : ['injected']

  return names.map((name) => {
    if (!(SUPPORTED_CONNECTOR_NAMES as readonly string[]).includes(name)) {
      throw new ConfigError(unsupportedConnectorMessage(name))
    }
    return name as WalletConnectorName
  })
}
