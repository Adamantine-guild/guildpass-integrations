import { http, injected, fallback } from 'wagmi'
import { walletConnect } from '@wagmi/connectors'
import { mainnet, base, sepolia } from 'wagmi/chains'
import type { Chain } from 'viem'
import type { CreateConnectorFn } from 'wagmi'
import type { Transport } from 'viem'
import { config as appConfig, ConfigError } from '@/lib/config'
import {
  parseConnectorNames as parseConnectorNamesCsv,
  type WalletConnectorName,
} from '@/lib/wallet/connectors'

export const supportedWalletChains = {
  mainnet,
  base,
  sepolia,
} as const

type SupportedWalletChainName = keyof typeof supportedWalletChains

type SupportedWalletChain = (typeof supportedWalletChains)[SupportedWalletChainName]

export interface WalletRuntimeConfig {
  chains: readonly [SupportedWalletChain, ...SupportedWalletChain[]]
  transports: Record<SupportedWalletChain['id'], Transport>
  connectors: readonly CreateConnectorFn[]
  connectorNames: readonly WalletConnectorName[]
}

const DEFAULT_CHAIN_NAMES: SupportedWalletChainName[] = ['mainnet', 'base', 'sepolia']
const SUPPORTED_CHAIN_NAMES = Object.keys(supportedWalletChains) as SupportedWalletChainName[]

function env(name: string): string | undefined {
  return process.env[name]
}

function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development'
}

function splitCsv(value: string | undefined): string[] {
  return value
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean) ?? []
}

function fail(message: string): never {
  throw new ConfigError(message)
}

function validateBrowserUrl(value: string, envName: string): string {
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

function parseChains(): readonly [SupportedWalletChain, ...SupportedWalletChain[]] {
  const configuredNames = splitCsv(env('NEXT_PUBLIC_WALLET_CHAINS'))
  const names = configuredNames.length > 0 ? configuredNames : DEFAULT_CHAIN_NAMES
  const chains = names.map((name) => {
    if (!SUPPORTED_CHAIN_NAMES.includes(name as SupportedWalletChainName)) {
      fail(
        [
          `NEXT_PUBLIC_WALLET_CHAINS contains unsupported chain "${name}".`,
          `Supported values: ${SUPPORTED_CHAIN_NAMES.join(', ')}.`,
        ].join(' '),
      )
    }
    return supportedWalletChains[name as SupportedWalletChainName]
  })

  const uniqueChains = chains.filter((chain, index, all) => all.findIndex((item) => item.id === chain.id) === index)

  if (uniqueChains.length === 0) {
    fail('NEXT_PUBLIC_WALLET_CHAINS must include at least one supported chain.')
  }

  return uniqueChains as [SupportedWalletChain, ...SupportedWalletChain[]]
}

function rpcEnvName(chain: Chain): string {
  const name = SUPPORTED_CHAIN_NAMES.find((candidate) => supportedWalletChains[candidate].id === chain.id)
  return `NEXT_PUBLIC_WALLET_RPC_${(name ?? String(chain.id)).toUpperCase()}`
}

// ── RPC Health Tracking ─────────────────────────────────────────────────────

const FAILURE_THRESHOLD = 3
const RECOVERY_COOLDOWN_MS = 60_000

interface EndpointHealth {
  failureCount: number
  lastFailureAt: number
  deprioritized: boolean
}

export const rpcHealth = new Map<string, EndpointHealth>()

export function recordRpcFailure(url: string): void {
  const now = Date.now()
  const entry = rpcHealth.get(url) ?? { failureCount: 0, lastFailureAt: 0, deprioritized: false }
  entry.failureCount += 1
  entry.lastFailureAt = now
  if (entry.failureCount >= FAILURE_THRESHOLD) {
    entry.deprioritized = true
  }
  rpcHealth.set(url, entry)
}

export function recordRpcSuccess(url: string): void {
  rpcHealth.delete(url)
}

export function isDeprioritized(url: string): boolean {
  const entry = rpcHealth.get(url)
  if (!entry) return false
  if (!entry.deprioritized) return false
  if (Date.now() - entry.lastFailureAt > RECOVERY_COOLDOWN_MS) {
    rpcHealth.delete(url)
    return false
  }
  return true
}

function sortByHealth(urls: string[]): string[] {
  return [...urls].sort((a, b) => {
    const aDp = isDeprioritized(a)
    const bDp = isDeprioritized(b)
    if (aDp && !bDp) return 1
    if (!aDp && bDp) return -1
    const aF = rpcHealth.get(a)?.failureCount ?? 0
    const bF = rpcHealth.get(b)?.failureCount ?? 0
    return aF - bF
  })
}

// ── Transport Builder ────────────────────────────────────────────────────────

function buildTransports(chains: readonly [SupportedWalletChain, ...SupportedWalletChain[]]): WalletRuntimeConfig['transports'] {
  return chains.reduce<WalletRuntimeConfig['transports']>((transports, chain) => {
    const envName = rpcEnvName(chain)
    const rawValue = env(envName)
    const urls = splitCsv(rawValue).map((u) => validateBrowserUrl(u, envName))
    const sorted = sortByHealth(urls)
    const userTransports = sorted.map((url) => http(url, { name: url }))
    transports[chain.id] = userTransports.length > 0
      ? fallback([...userTransports, http()])
      : http()
    return transports
  }, {} as WalletRuntimeConfig['transports'])
}

// ── Connector Builder ────────────────────────────────────────────────────────

function parseConnectorNames(): readonly WalletConnectorName[] {
  return parseConnectorNamesCsv(env('NEXT_PUBLIC_WALLET_CONNECTORS'))
}

function buildConnectors(connectorNames: readonly WalletConnectorName[]): CreateConnectorFn[] {
  return connectorNames.map((name) => {
    switch (name) {
      case 'injected':
        return injected({ shimDisconnect: true })
      case 'walletConnect': {
        const projectId = env('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID')
        if (!projectId) {
          fail(
            'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required when using the walletConnect connector.',
          )
        }
        return walletConnect({
          projectId,
          showQrModal: true,
        })
      }
    }
  })
}

export function hasInjectedWallet(): boolean {
  if (typeof window === 'undefined') return false
  return typeof window.ethereum !== 'undefined'
}

// ── Main Config Builder ──────────────────────────────────────────────────────

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
