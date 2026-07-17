'use client'

/**
 * components/FallbackNoticeBanner.tsx
 *
 * Dismissible warning banner shown when the wallet is connected but the
 * primary RPC endpoint is unreachable and traffic is being served via
 * a public fallback RPC. Uses the useFallbackNotice hook.
 */
import { useFallbackNotice } from '@/lib/wallet/useFallbackNotice'

export function FallbackNoticeBanner() {
  const { isFallbackActive, dismiss } = useFallbackNotice()

  if (!isFallbackActive) return null

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] max-w-lg w-[calc(100%-2rem)] bg-amber-50 border border-amber-300 text-amber-900 rounded-xl shadow-lg px-4 py-3 flex items-start gap-3"
    >
      <span className="material-symbols-outlined text-amber-600 text-lg mt-0.5 shrink-0">
        warning
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">RPC fallback active</p>
        <p className="text-xs text-amber-800 mt-0.5">
          The primary RPC endpoint for your current chain is unreachable.
          Traffic is routed through a public fallback. Your connection is
          working, but performance may differ.
        </p>
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 p-1 rounded-lg hover:bg-amber-100 transition-colors"
        aria-label="Dismiss fallback notice"
      >
        <span className="material-symbols-outlined text-amber-600 text-lg">close</span>
      </button>
    </div>
  )
}
