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
import { WagmiProvider, createConfig, http, injected, useSignMessage, useAccount, useDisconnect } from 'wagmi'
import { mainnet, base, sepolia } from 'wagmi/chains'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { getApi } from '@/lib/api'
import { SiweAuthSession } from '@/lib/api/types'
import { clearAuthSession, loadAuthSession, storeAuthSession } from '@/lib/session'

// ── Wagmi config (unchanged) ──────────────────────────────────────────────────

const wagmiConfig = createConfig({
  chains: [mainnet, base, sepolia],
  connectors: [injected()],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [sepolia.id]: http(),
  },
})

// ── SIWE Auth Context ─────────────────────────────────────────────────────────

export interface SiweAuthContextValue {
  /** The authenticated session, or null if the user has not signed in. */
  authSession: SiweAuthSession | null
  isAuthenticated: boolean
  /** True while a signature request is in-flight. */
  isSigningIn: boolean
  /** Human-readable error from the most recent signIn attempt, if any. */
  error: string | null
  /** Trigger the EIP-4361 sign-in flow for the currently connected address. */
  signIn: () => Promise<void>
  /** Clear the session and disconnect the wallet. */
  logout: () => Promise<void>
}

const SiweAuthContext = createContext<SiweAuthContextValue>({
  authSession: null,
  isAuthenticated: false,
  isSigningIn: false,
  error: null,
  signIn: async () => {},
  logout: async () => {},
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

  // Restore persisted session on mount / address change
  useEffect(() => {
    const stored = loadAuthSession()
    if (stored && stored.address === address) {
      setAuthSession(stored)
    } else {
      // Address changed (e.g. different MetaMask account) — clear stale session
      setAuthSession(null)
    }
  }, [address])

  // Clear session when wallet disconnects
  useEffect(() => {
    if (!address && authSession) {
      setAuthSession(null)
      clearAuthSession()
    }
  }, [address, authSession])

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
      const domain =
        process.env.NEXT_PUBLIC_SIWE_DOMAIN ??
        (typeof window !== 'undefined' ? window.location.host : 'localhost')
      const statement =
        process.env.NEXT_PUBLIC_SIWE_STATEMENT ?? 'Sign in to GuildPass Admin'
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
      // Invalidate session queries so role-aware UI refreshes
      await queryClient.invalidateQueries({ queryKey: ['session'] })
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
    setError(null)
    disconnect()
    queryClient.removeQueries({ queryKey: ['session'] })
  }, [authSession, address, disconnect, queryClient])

  const value: SiweAuthContextValue = {
    authSession,
    isAuthenticated: !!authSession,
    isSigningIn,
    error,
    signIn,
    logout,
  }

  return <SiweAuthContext.Provider value={value}>{children}</SiweAuthContext.Provider>
}

// ── Root providers (public export, used in app/layout.tsx) ───────────────────

export function RootProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SiweAuthProvider>{children}</SiweAuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
