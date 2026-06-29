'use client'
/**
 * lib/wallet/providers.tsx
 *
 * Global providers for the GuildPass frontend.
 *
 * SIWE additions:
 *  - SiweAuthContext exposes the authenticated session state, a signIn() function
 *    that walks the user through the EIP-4361 signing flow, and a logout() function
 *    that clears everything.
 *  - The context is initialised from sessionStorage on mount so the session
 *    survives page navigations within the same tab.
 *  - useSiweAuth() is the public hook for consuming the context.
 *
 * The SIWE message is built manually per EIP-4361 using only fields available
 * from wagmi/viem (no additional `siwe` npm package required).
 */

import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { WagmiProvider, createConfig, useSignMessage, useAccount, useDisconnect } from 'wagmi'
import { walletConfig } from '@/lib/wallet/config'
import { QueryClient, QueryClientProvider, useQueryClient, QueryCache } from '@tanstack/react-query'
import { getApi } from '@/lib/api'
import { config } from '@/lib/config'
import { SiweAuthSession, AdminSessionStatus } from '@/lib/api/types'
import { clearAuthSession, loadAuthSession, storeAuthSession } from '@/lib/session'
import { isApiError } from '@/lib/api/errors'
import { accessKeys, queryKeys } from '@/lib/query'

// ── Wagmi config ─────────────────────────────────────────────────────────────

const wagmiConfig = createConfig(walletConfig)

// ── SIWE Auth Context ─────────────────────────────────────────────────────────

export interface SiweAuthContextValue {
  /** The authenticated session, or null if the user has not signed in. */
  authSession: SiweAuthSession | null
  isAuthenticated: boolean
  /** Granular status of the admin session. */
  sessionStatus: AdminSessionStatus
  /** True while a signature request is in-flight. */
  isSigningIn: boolean
  /** Human-readable error from the most recent signIn attempt, if any. */
  error: string | null
  /** Trigger the EIP-4361 sign-in flow for the currently connected address. */
  signIn: () => Promise<void>
  /** Clear the session and disconnect the wallet. */
  logout: () => Promise<void>
  /** Mark the current session as expired (e.g. after a 401 from the backend). */
  markExpired: () => void
}

const SiweAuthContext = createContext<SiweAuthContextValue>({
  authSession: null,
  isAuthenticated: false,
  sessionStatus: 'disconnected',
  isSigningIn: false,
  error: null,
  signIn: async () => {},
  logout: async () => {},
  markExpired: () => {},
})

export function useSiweAuth(): SiweAuthContextValue {
  return useContext(SiweAuthContext)
}

// ── Internal provider (must be inside Wagmi + QueryClient providers) ──────────

function SiweAuthProvider({ children }: PropsWithChildren) {
  const { address, chain } = useAccount()
  const { disconnect } = useDisconnect()
  const { signMessageAsync } = useSignMessage()
  const queryClient = useQueryClient()

  const [authSession, setAuthSession] = useState<SiweAuthSession | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isExpired, setIsExpired] = useState(false)

  // Restore persisted session on mount / address change
  useEffect(() => {
    const stored = loadAuthSession()
    if (stored && stored.address === address) {
      setAuthSession(stored)
      setIsExpired(false)
    } else {
      // Address changed (e.g. different MetaMask account) — clear stale session and queries
      setAuthSession(null)
      setIsExpired(false)
      if (stored) {
        clearAuthSession()
      }
      // Clear all wallet-scoped and admin queries
      queryClient.removeQueries({ queryKey: queryKeys.session.all })
      queryClient.removeQueries({ queryKey: queryKeys.profile.all })
      queryClient.removeQueries({ queryKey: queryKeys.walletVerification.all })
      queryClient.removeQueries({ queryKey: accessKeys.all })
      queryClient.removeQueries({ queryKey: queryKeys.members.all })
      queryClient.removeQueries({ queryKey: queryKeys.policies.all })
      queryClient.removeQueries({ queryKey: queryKeys.resources.all })
      queryClient.removeQueries({ queryKey: queryKeys.webhookEvents.all })
    }
  }, [address, queryClient])

  // Clear session and cached access decisions when wallet disconnects
  useEffect(() => {
    if (!address && authSession) {
      setAuthSession(null)
      clearAuthSession()
      // Clear all wallet-scoped and admin queries
      queryClient.removeQueries({ queryKey: queryKeys.session.all })
      queryClient.removeQueries({ queryKey: queryKeys.profile.all })
      queryClient.removeQueries({ queryKey: queryKeys.walletVerification.all })
      queryClient.removeQueries({ queryKey: accessKeys.all })
      queryClient.removeQueries({ queryKey: queryKeys.members.all })
      queryClient.removeQueries({ queryKey: queryKeys.policies.all })
      queryClient.removeQueries({ queryKey: queryKeys.resources.all })
      queryClient.removeQueries({ queryKey: queryKeys.webhookEvents.all })
    }
  }, [address, authSession, queryClient])

  // Respond to external invalidation events (e.g. 401 detected globally)
  useEffect(() => {
    const handler = () => {
      setAuthSession(null)
      setError('Session expired. Please sign in again.')
      try {
        clearAuthSession()
      } catch {
        // ignore
      }
      try {
        disconnect()
      } catch {
        // ignore
      }
      // Clear all wallet-scoped and admin queries
      queryClient.removeQueries({ queryKey: queryKeys.session.all })
      queryClient.removeQueries({ queryKey: queryKeys.profile.all })
      queryClient.removeQueries({ queryKey: queryKeys.walletVerification.all })
      queryClient.removeQueries({ queryKey: accessKeys.all })
      queryClient.removeQueries({ queryKey: queryKeys.members.all })
      queryClient.removeQueries({ queryKey: queryKeys.policies.all })
      queryClient.removeQueries({ queryKey: queryKeys.resources.all })
      queryClient.removeQueries({ queryKey: queryKeys.webhookEvents.all })
    }

    window.addEventListener('siwe:invalidated', handler)
    return () => window.removeEventListener('siwe:invalidated', handler)
  }, [disconnect, queryClient])

  const signIn = useCallback(async () => {
    if (!address) {
      setError('Connect your wallet before signing in.')
      return
    }
    setIsSigningIn(true)
    setError(null)
    try {
      const api = getApi(address)
      const nonce = await api.getNonce(address)

      // Build EIP-4361 message — compatible with the `siwe` package's format
      const domain = config.siwe.domain
      const statement = config.siwe.statement
      const issuedAt = new Date().toISOString()
      const chainId = chain?.id ?? 1

      const siweMessage = [
        `${domain} wants you to sign in with your Ethereum account:`,
        address,
        '',
        statement,
        '',
        `URI: ${typeof window !== 'undefined' ? window.location.origin : `https://${domain}`}`,
        `Version: 1`,
        `Chain ID: ${chainId}`,
        `Nonce: ${nonce}`,
        `Issued At: ${issuedAt}`,
      ].join('\n')

      const signature = await signMessageAsync({ message: siweMessage })

      const session = await api.siweVerify(siweMessage, signature)
      storeAuthSession(session)
      setAuthSession(session)
      setIsExpired(false)
      // Invalidate session queries so role-aware UI refreshes
      await queryClient.invalidateQueries({ queryKey: queryKeys.session.all })
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'UserRejectedRequestError') {
        setError('Signature request was rejected.')
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Sign-in failed. Please try again.')
      }
    } finally {
      setIsSigningIn(false)
    }
  }, [address, chain, signMessageAsync, queryClient])

  const logout = useCallback(async () => {
    if (authSession) {
      try {
        await getApi(address, authSession.token).siweLogout(authSession.token)
      } catch {
        // Best-effort server-side invalidation
      }
    }
    clearAuthSession()
    setAuthSession(null)
    setIsExpired(false)
    setError(null)
    disconnect()
    // Clear all wallet-scoped and admin queries
    queryClient.removeQueries({ queryKey: queryKeys.session.all })
    queryClient.removeQueries({ queryKey: queryKeys.profile.all })
    queryClient.removeQueries({ queryKey: queryKeys.walletVerification.all })
    queryClient.removeQueries({ queryKey: accessKeys.all })
    queryClient.removeQueries({ queryKey: queryKeys.members.all })
    queryClient.removeQueries({ queryKey: queryKeys.policies.all })
    queryClient.removeQueries({ queryKey: queryKeys.resources.all })
    queryClient.removeQueries({ queryKey: queryKeys.webhookEvents.all })
  }, [authSession, address, disconnect, queryClient])

  /** Called by admin mutation error handlers when the backend returns 401. */
  const markExpired = useCallback(() => {
    clearAuthSession()
    setAuthSession(null)
    setIsExpired(true)
  }, [])

  // Derive the granular session status from existing state
  const sessionStatus: AdminSessionStatus = !address
    ? 'disconnected'
    : isSigningIn
    ? 'authenticating'
    : isExpired
    ? 'expired'
    : authSession
    ? 'authenticated'
    : 'connected'

  const value: SiweAuthContextValue = {
    authSession,
    isAuthenticated: !!authSession,
    sessionStatus,
    isSigningIn,
    error,
    signIn,
    logout,
    markExpired,
  }

  return <SiweAuthContext.Provider value={value}>{children}</SiweAuthContext.Provider>
}

// ── Root providers (public export, used in app/layout.tsx) ───────────────────

export function RootProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(() =>
    new QueryClient({
      queryCache: new QueryCache({
        onError: (err: unknown) => {
          try {
            if (isApiError(err) && err.code === 'unauthorized') {
              // Clear persisted session and cached queries on 401 so UI resets
              clearAuthSession()
              // best-effort: remove session-related cache
              // Note: QueryClient instance is available as `queryClient` here,
              // but removing queries from within the constructor callback is
              // not supported — we'll remove them after creation below.
            }
          } catch {
            // ignore
          }
        },
      }),
    }),
  )

  // After creating the client, ensure session-related queries are cleared
  // when we detect an unauthorized error via the onError hook above.
  useEffect(() => {
    const handler = () => {
      queryClient.removeQueries({ queryKey: queryKeys.session.all })
      queryClient.removeQueries({ queryKey: queryKeys.profile.all })
      queryClient.removeQueries({ queryKey: queryKeys.walletVerification.all })
      queryClient.removeQueries({ queryKey: accessKeys.all })
      queryClient.removeQueries({ queryKey: queryKeys.members.all })
      queryClient.removeQueries({ queryKey: queryKeys.policies.all })
      queryClient.removeQueries({ queryKey: queryKeys.resources.all })
      queryClient.removeQueries({ queryKey: queryKeys.webhookEvents.all })
    }
    window.addEventListener('siwe:invalidated', handler)
    return () => window.removeEventListener('siwe:invalidated', handler)
  }, [queryClient])
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SiweAuthProvider>{children}</SiweAuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
