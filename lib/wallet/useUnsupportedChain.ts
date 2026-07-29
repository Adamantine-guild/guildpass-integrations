/**
 * lib/wallet/useUnsupportedChain.ts
 *
 * Detects when the wallet is connected to a chain that is not in the
 * configured supported set and exposes a `switchChain` function (via
 * wagmi's useSwitchChain) so callers can prompt the user to switch.
 *
 * When the wallet doesn't support EIP-3085 (wallet_switchEthereumChain),
 * useSwitchChain throws; the caller should fall back to the manual
 * instructions returned by `manualSwitchInstruction()` in `chains.ts`.
 */

'use client'

import { useCallback } from 'react'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { isChainSupported, chainLabel, manualSwitchInstruction } from './chains'
import { walletConfig } from './config'

export interface UnsupportedChainState {
  /** True when the wallet is connected and `chainId` is NOT in the supported set. */
  isUnsupported: boolean
  /** The current wallet chain ID (always present when connected). */
  chainId: number | undefined
  /** Human-readable name of the currently connected (unsupported) chain. */
  currentChainLabel: string
  /** The *first* supported chain — used as the default target for switching. */
  targetChainId: number
  /** Human-readable name of the default target chain. */
  targetChainLabel: string
  /** All supported chain IDs (for multi‑choice UIs). */
  supportedChainIds: number[]
  /** All supported chain names (for multi‑choice UIs). */
  supportedChainNames: string[]
  /**
   * Attempt a programmatic chain switch to the first supported chain.
   * Returns a promise that resolves on success or rejects on failure
   * (wallet refusal, missing EIP‑3085 support, etc.).
   */
  switchToSupportedChain: () => Promise<void>
  /**
   * Human-readable instruction for manual switching, shown when
   * `switchToSupportedChain()` fails or is unavailable.
   */
  manualInstruction: string
}

/**
 * Hook that monitors the wallet's active chain and returns state
 * describing whether it is unsupported, along with actions to switch.
 *
 * When the wallet is not connected, `isUnsupported` is always `false`.
 */
export function useUnsupportedChain(): UnsupportedChainState {
  const { isConnected } = useAccount()
  const chainId = useChainId()

  // Wagmi v2 switchChain — throws when the wallet doesn't support EIP-3085
  const { switchChainAsync } = useSwitchChain()

  const supportedChains = walletConfig.chains

  const targetChainId = supportedChains[0]!.id
  const targetChainLabel = chainLabel(targetChainId)

  const isUnsupported = isConnected && !isChainSupported(chainId)

  const currentChainLabel = chainId != null ? chainLabel(chainId) : ''

  const supportedChainIds = supportedChains.map((c) => c.id)

  const supportedChainNames = supportedChains.map((c) => c.name)

  const switchToSupportedChain = useCallback(async () => {
    await switchChainAsync({ chainId: targetChainId })
  }, [switchChainAsync, targetChainId])

  const manualInstruction = manualSwitchInstruction(targetChainLabel)

  return {
    isUnsupported,
    chainId,
    currentChainLabel,
    targetChainId,
    targetChainLabel,
    supportedChainIds,
    supportedChainNames,
    switchToSupportedChain,
    manualInstruction,
  }
}
