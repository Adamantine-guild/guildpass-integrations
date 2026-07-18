/**
 * lib/wallet/useFallbackNotice.ts
 *
 * Detects when the wallet is operating on a fallback RPC endpoint.
 * Works by attempting a lightweight eth_blockNumber call to the primary
 * RPC URL on each chain switch. If it fails and the wallet is connected,
 * isFallbackActive is set to true.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { useAccount, useChainId } from 'wagmi'

interface FallbackNoticeState {
  /** True when the app is serving traffic via a fallback RPC endpoint. */
  isFallbackActive: boolean
  /** Dismiss the notice for the current chain (until the next chain switch). */
  dismiss: () => void
}

/**
 * Get the configured primary RPC URL for a chain from env vars.
 */
function getPrimaryRpcUrl(chainId: number): string | undefined {
  const envKey = `NEXT_PUBLIC_WALLET_RPC_${chainIdToEnvSuffix(chainId)}`
  return typeof process !== 'undefined' ? process.env[envKey] : undefined
}

function chainIdToEnvSuffix(chainId: number): string {
  switch (chainId) {
    case 1: return 'MAINNET'
    case 8453: return 'BASE'
    case 11155111: return 'SEPOLIA'
    default: return ''
  }
}

/**
 * Attempt a lightweight eth_blockNumber call to the given RPC URL.
 * Returns true if the primary RPC responds, false if it fails.
 */
async function pingRpc(url: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5_000)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return false
    const data = await res.json()
    return data?.result != null
  } catch {
    return false
  }
}

export function useFallbackNotice(): FallbackNoticeState {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const [isFallbackActive, setIsFallbackActive] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const lastChainRef = useRef(chainId)

  const checkFallback = useCallback(async () => {
    const primaryUrl = getPrimaryRpcUrl(chainId)
    // Without a configured primary URL there's nothing to fallback from
    if (!primaryUrl) {
      setIsFallbackActive(false)
      return
    }

    const alive = await pingRpc(primaryUrl)
    setIsFallbackActive(!alive)
  }, [chainId])

  // Reset dismissal and re-check when chain changes or wallet connects
  useEffect(() => {
    if (lastChainRef.current !== chainId) {
      setDismissed(false)
      lastChainRef.current = chainId
    }

    if (isConnected && !dismissed) {
      void checkFallback()
    }
  }, [chainId, isConnected, dismissed, checkFallback])

  const dismiss = useCallback(() => {
    setDismissed(true)
    setIsFallbackActive(false)
  }, [])

  return { isFallbackActive: isFallbackActive && !dismissed && isConnected, dismiss }
}
