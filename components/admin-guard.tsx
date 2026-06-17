'use client'
/**
 * components/admin-guard.tsx
 *
 * Strictly gates admin pages through three layers:
 *
 *  Layer 1 — Wallet connection
 *    No wallet → <AccessDenied> (generic connection prompt)
 *
 *  Layer 2 — SIWE authentication
 *    Connected but no SIWE session → <SiwePrompt> (explains WHY, then prompts to sign)
 *
 *  Layer 3 — Admin role
 *    SIWE-authenticated but not admin → <AccessDenied> (privilege error)
 *
 *  All clear → renders children ✓
 *
 * Using the session query result for the role check ensures the role list is
 * always fresh from the backend and not stale from a cached state.
 */

import { ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { getApi } from '@/lib/api'
import { AccessDenied } from './gated'
import { useSiweAuth } from '@/lib/wallet/providers'
import { Button } from './ui/button'

// ── SiwePrompt ────────────────────────────────────────────────────────────────

/**
 * Shown when a wallet is connected but no SIWE session exists.
 * Explains the purpose of the signature before asking for it.
 */
function SiwePrompt() {
  const { signIn, isSigningIn, error } = useSiweAuth()
  return (
    <div className="rounded-md border p-6 max-w-md space-y-4">
      <div className="flex items-start gap-3">
        {/* Shield icon */}
        <svg
          className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.25C16.5 22.15 20 17.25 20 12V6l-8-4z"
          />
        </svg>
        <div>
          <h2 className="text-base font-semibold">Admin Verification Required</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            To access the admin panel, you need to prove you own this wallet by signing
            a one-time message. This is a{' '}
            <strong className="font-medium">gasless, off-chain</strong> signature — it
            does not cost any ETH and does not execute a transaction.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-muted-foreground list-disc list-inside">
            <li>Your signature is verified by our backend to issue a secure session token.</li>
            <li>The session expires automatically after 1 hour.</li>
            <li>You can sign out at any time from the navigation bar.</li>
          </ul>
        </div>
      </div>

      {error && (
        <p id="siwe-prompt-error" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        id="siwe-prompt-signin-btn"
        onClick={signIn}
        disabled={isSigningIn}
        className="w-full sm:w-auto"
      >
        {isSigningIn ? (
          <span className="flex items-center gap-1.5">
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Waiting for signature…
          </span>
        ) : (
          'Sign Message to Continue'
        )}
      </Button>
    </div>
  )
}

// ── AdminGuard ────────────────────────────────────────────────────────────────

export function AdminGuard({ children }: { children: ReactNode }) {
  const { address } = useAccount()
  const { isAuthenticated, authSession } = useSiweAuth()

  const { data: session, isLoading } = useQuery({
    queryKey: ['session', address],
    queryFn: () => getApi(address, authSession?.token).getSession(),
    // Only fetch if we have an authenticated SIWE session
    enabled: !!address && isAuthenticated,
  })

  // Layer 1 — wallet must be connected
  if (!address) {
    return <AccessDenied reason="Connect your wallet to access the admin area." />
  }

  // Layer 2 — must have a valid SIWE session
  if (!isAuthenticated) {
    return <SiwePrompt />
  }

  // Loading role data from backend
  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground" aria-live="polite">
        Verifying admin privileges…
      </div>
    )
  }

  // Layer 3 — must have the 'admin' role
  if (!session?.roles?.includes('admin')) {
    return <AccessDenied reason="Admin privileges are required to view this page." />
  }

  return <>{children}</>
}
