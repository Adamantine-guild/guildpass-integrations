import { http, injected, fallback } from 'wagmi'
import { mainnet, base, sepolia } from 'wagmi/chains'
import type { Chain } from 'viem'
import type { CreateConnectorFn } from 'wagmi'
import type { Transport } from 'viem'
import { config as appConfig, ConfigError } from '@/lib/config'
import {
  DEFAULT_CHAIN_NAMES,
  SUPPORTED_CHAIN_NAMES,
  parseConnectorNames as parseConnectorNamesCsv,
  parseWalletChainNames,
  rpcEnvNameFromChainName,
  validateBrowserUrl,
  type SupportedWalletChainName,
  type WalletConnectorName,
} from '@/lib/wallet/validation.js'

export const supportedWalletChains = {
  mainnet,
  base,
  sepolia,
} as const

type SupportedWalletChain = (typeof supportedWalletChains)[SupportedWalletChainName]

export interface WalletRuntimeConfig {
  chains: readonly [SupportedWalletChain, ...SupportedWalletChain[]]
  transports: Record<SupportedWalletChain['id'], Transport>
  connectors: readonly CreateConnectorFn[]
  connectorNames: readonly WalletConnectorName[]
}

function env(name: string): string | undefined {
  return process.env[name]
}

function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development'
}

function parseChains(): readonly [SupportedWalletChain, ...SupportedWalletChain[]] {
  const chainNames = parseWalletChainNames(env('NEXT_PUBLIC_WALLET_CHAINS'))
  const chains = chainNames.map((name) => {
    return supportedWalletChains[name as SupportedWalletChainName]
  })

  return chains as [SupportedWalletChain, ...SupportedWalletChain[]]
}

function rpcEnvName(chain: Chain): string {
  const name = SUPPORTED_CHAIN_NAMES.find((candidate) => supportedWalletChains[candidate].id === chain.id)
  return rpcEnvNameFromChainName(name ?? String(chain.id))
}

function buildTransports(chains: readonly [SupportedWalletChain, ...SupportedWalletChain[]]): WalletRuntimeConfig['transports'] {
  return chains.reduce<WalletRuntimeConfig['transports']>((transports, chain) => {
    const envName = rpcEnvName(chain)
    const rpcUrl = env(envName)
    const primaryTransport = rpcUrl ? http(validateBrowserUrl(rpcUrl, envName)) : null
    transports[chain.id] = primaryTransport
      ? fallback([primaryTransport, http()])
      : http()
    return transports
  }, {} as WalletRuntimeConfig['transports'])
}

function parseConnectorNames(): readonly WalletConnectorName[] {
  return parseConnectorNamesCsv(env('NEXT_PUBLIC_WALLET_CONNECTORS'))
}

function buildConnectors(connectorNames: readonly WalletConnectorName[]): CreateConnectorFn[] {
  return connectorNames.map((name) => {
    switch (name) {
      case 'injected':
        return injected({ shimDisconnect: true })
    }
  })
}

function buildWalletConfig(): WalletRuntimeConfig {
  try {
    const chains = parseChains()
    const connectorNames = parseConnectorNames()

    return Object.freeze({
      chains,
      transports: Object.freeze(buildTransports(chains)),
      connectors: Object.freeze(buildConnectors(connectorNames)),
      connectorNames: Object.freeze(connectorNames),
    })
  } catch (error) {
    if (appConfig.apiMode === 'mock' && !isDevelopment()) {
      const chains = DEFAULT_CHAIN_NAMES.map((name) => supportedWalletChains[name]) as [
        SupportedWalletChain,
        ...SupportedWalletChain[],
      ]
      return Object.freeze({
        chains,
        transports: Object.freeze(buildTransports(chains)),
        connectors: Object.freeze([injected({ shimDisconnect: true })]),
        connectorNames: Object.freeze(['injected'] as const),
      })
    }
    throw error
  }
}

export const walletConfig = buildWalletConfig()
