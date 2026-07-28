/**
 * lib/wallet/chains.ts
 *
 * Pure utilities for wallet chain validation — no wagmi/viem/React deps,
 * so these can be unit-tested without a test renderer or type declarations.
 */

import { walletConfig } from './config'

// ── Lookup helpers ───────────────────────────────────────────────────────────

/**
 * Return the chain IDs of every supported chain.
 */
export function getSupportedChainIds(): number[] {
  return walletConfig.chains.map((c) => c.id)
}

/**
 * Return the display names of every supported chain (e.g. "Ethereum", "Base").
 */
export function getSupportedChainNames(): string[] {
  return walletConfig.chains.map((c) => c.name)
}

// ── Detection ────────────────────────────────────────────────────────────────

/**
 * Returns true when `chainId` is one of the IDs listed in the runtime
 * wallet configuration.
 *
 * Pure — can be called from any context (React hook, effect, test).
 */
export function isChainSupported(chainId: number): boolean {
  return getSupportedChainIds().includes(chainId)
}

/**
 * Human-readable label for a chain ID (e.g. "Ethereum Mainnet" for 1).
 * Falls back to "Chain {id}" when the ID isn't recognised.
 */
export function chainLabel(chainId: number): string {
  // First check the runtime config
  const match = walletConfig.chains.find((c) => c.id === chainId)
  if (match) return match.name
  // Known non-supported chain IDs — provide best-effort names
  const known: Record<number, string> = {
    56: 'BNB Smart Chain',
    100: 'Gnosis',
    137: 'Polygon',
    250: 'Fantom',
    42161: 'Arbitrum One',
    43114: 'Avalanche C-Chain',
    10: 'Optimism',
    324: 'zkSync Era',
    534352: 'Scroll',
  }
  return known[chainId] ?? `Chain ${chainId}`
}

// ── Manual-switch instructions ───────────────────────────────────────────────

/**
 * Human-readable action text shown when the wallet does not support
 * programmatic chain switching (e.g. an injected browser wallet via
 * older EIP-3085). The user is directed to open their wallet UI and
 * switch manually.
 */
export function manualSwitchInstruction(targetChainName: string): string {
  return `Please open your browser wallet extension and switch the connected network to ${targetChainName} manually.`
}
