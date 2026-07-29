export const DEFAULT_CHAIN_NAMES: readonly ['mainnet', 'base', 'sepolia']
export const SUPPORTED_CHAIN_NAMES: readonly ['mainnet', 'base', 'sepolia']

export type SupportedWalletChainName = (typeof SUPPORTED_CHAIN_NAMES)[number]

export const SUPPORTED_CONNECTOR_NAMES: readonly ['injected']
export type WalletConnectorName = (typeof SUPPORTED_CONNECTOR_NAMES)[number]

export const CONNECTOR_DOCS_URL: string

export interface WalletEnvValidation {
  chainNames: readonly [SupportedWalletChainName, ...SupportedWalletChainName[]]
  connectorNames: readonly WalletConnectorName[]
  rpcUrls: Readonly<Record<string, string | undefined>>
}

export function parseConnectorNames(csv: string | undefined): readonly WalletConnectorName[]
export function parseWalletChainNames(
  csv: string | undefined,
): readonly [SupportedWalletChainName, ...SupportedWalletChainName[]]
export function rpcEnvNameFromChainName(name: string): string
export function splitCsv(value: string | undefined): string[]
export function unsupportedConnectorMessage(name: string): string
export function validateBrowserUrl(value: string, envName: string): string
export function validateWalletEnv(
  source?: Record<string, string | undefined>,
): WalletEnvValidation
