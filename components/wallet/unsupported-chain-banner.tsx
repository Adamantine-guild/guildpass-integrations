'use client'

/**
 * components/wallet/unsupported-chain-banner.tsx
 *
 * Persistent, dismissible banner shown when the connected wallet is on a
 * chain that is not in the configured supported set. Provides a "Switch"
 * button that calls wagmi's `switchChainAsync` and falls back to manual
 * instructions when programmatic switching fails.
 */

import { useState, useCallback } from 'react'
import { useUnsupportedChain } from '@/lib/wallet/useUnsupportedChain'
import { Button } from '@/components/ui/button'

export function UnsupportedChainBanner() {
  const {
    isUnsupported,
    currentChainLabel,
    targetChainLabel,
    targetChainId,
    supportedChainNames,
    switchToSupportedChain,
    manualInstruction,
  } = useUnsupportedChain()

  const [switchState, setSwitchState] = useState<
    'idle' | 'switching' | 'failed' | 'manual'
  >('idle')

  const handleSwitch = useCallback(async () => {
    setSwitchState('switching')
    try {
      await switchToSupportedChain()
      // On success the wallet will emit a `chainChanged` event, causing
      // `isUnsupported` to become `false` on the next render — the banner
      // will automatically disappear.
      setSwitchState('idle')
    } catch {
      // Wallet refused or doesn't support EIP-3085
      setSwitchState('failed')
    }
  }, [switchToSupportedChain])

  const resetSwitch = useCallback(() => {
    setSwitchState('idle')
  }, [])

  const isRetrying =
    switchState === 'switching'

  if (!isUnsupported) {
    // Reset internal state when the user manually switches away
    if (switchState !== 'idle') setSwitchState('idle')
    return null
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="border-b border-yellow-300 bg-yellow-50 px-4 py-3 dark:border-yellow-700/40 dark:bg-yellow-900/20"
    >
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
            Unsupported network detected
          </p>
          <p className="text-xs text-yellow-800 dark:text-yellow-200">
            Your wallet is connected to{' '}
            <strong>{currentChainLabel}</strong>, but this application only
            supports{' '}
            {supportedChainNames.length === 1
              ? supportedChainNames[0]
              : supportedChainNames
                  .slice(0, -1)
                  .join(', ') +
                ' or ' +
                supportedChainNames.slice(-1)}
            .
            {switchState === 'failed' && (
              <span className="mt-1 block">{manualInstruction}</span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {switchState === 'failed' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={resetSwitch}
              className="border-yellow-400 text-yellow-900 hover:bg-yellow-100 dark:border-yellow-600 dark:text-yellow-100 dark:hover:bg-yellow-800/30"
            >
              Dismiss
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleSwitch}
              disabled={isRetrying}
              aria-busy={isRetrying}
              className="bg-yellow-600 text-white hover:bg-yellow-700 focus-visible:ring-yellow-500 dark:bg-yellow-500 dark:text-yellow-950 dark:hover:bg-yellow-400"
            >
              {isRetrying
                ? `Switching to ${targetChainLabel}…`
                : `Switch to ${targetChainLabel}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
