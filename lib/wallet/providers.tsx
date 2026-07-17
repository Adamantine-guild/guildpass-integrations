'use client'

/**
 * lib/wallet/providers.tsx
 *
 * Root provider tree for GuildPass.  Composes:
 *   - WagmiProvider       — wallet connectivity (wagmi + viem)
 *   - QueryClientProvider — server-state cache (React Query)
 *   - SiweAuthProvider    — SIWE session lifecycle
 *
 * ── Session lifecycle (issue #166) ──────────────────────────────────────────
 *
 * Access token + refresh token
 * ────────────────────────────
 * Sign-in returns a short-lived access token (~1 h) *and* a longer-lived
 * refresh token (~7 d).  60 s before the access token expires the provider
 * automatically calls `siweRefresh()` to obtain a new pair, transparently
 * extending the session without requiring a fresh wallet signature.
 *
 * If the refresh token itself has expired, or if `siweRefresh()` returns a
 * 401, the session transitions to `'expired'` and the user must sign again.
 *
 * Multi-tab synchronisation — BroadcastChannel
 * ─────────────────────────────────────────────
 * A single named channel (`guildpass:auth`) broadcasts auth-state transitions
 * to every other same-origin tab.  Three message types are emitted:
 *
 *   { type: 'signed-in',  session: SiweAuthSession }
 *     — Sent after a successful wallet signature.  Peer tabs write the session
 *       to sessionStorage and update their local state immediately so they
 *       become authenticated without requiring a new signature.
 *
 *   { type: 'refreshed',  session: SiweAuthSession }
 *     — Sent after a silent token renewal.  Peer tabs update their token.
 *
 *   { type: 'signed-out' }
 *     — Sent after an explicit logout or a detected expiry.  Peer tabs clear
 *       their session and transition to the appropriate unauthenticated state.
 *
 * The tab that sends a message does NOT receive it via its own listener
 * (BroadcastChannel's same-tab exclusion), so there is no risk of loops.
 *
 * lib/session.ts remains the single source of truth for the persisted token.
 * BroadcastChannel is used only for propagation; each tab writes its own
 * sessionStorage entry independently.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import {
  WagmiProvider,
  createConfig,
  useSignMessage,
  useAccount,
  useDisconnect,
} from 'wagmi'
import { walletConfig } from '@/lib/wallet/config'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getApi } from '@/lib/api'
import { config } from '@/lib/config'
import { SiweAuthSession, AdminSessionStatus } from '@/lib/api/types'
import {
  clearAuthSession,
  isRefreshTokenExpired,
  loadAuthSession,
  loadAuthSessionIncludingExpired,
  msUntilRenewal,
  storeAuthSession,
} from '@/lib/session'
import { isApiError } from '@/lib/api/errors'
import {
  buildSiweMessage,
  deriveSessionStatus,
  initialSiweSessionState,
  siweSessionReducer,
} from '@/lib/wallet/siwe-session'

// ── Wagmi config ──────────────────────────────────────────────────────────────

const wagmiConfig = createConfig(walletConfig)

// ── BroadcastChannel message types ───────────────────────────────────────────

type AuthBroadcastMessage =
  | { type: 'signed-in'; session: SiweAuthSession }
  | { type: 'refreshed'; session: SiweAuthSession }
  | { type: 'signed-out' }

const AUTH_CHANNEL_NAME = 'guildpass:auth'

// ── SIWE Auth Context ─────────────────────────────────────────────────────────

export interface SiweAuthContextValue {
  /** The authenticated session, or null if the user has not signed in. */
  authSession: SiweAuthSession | null
  isAuthenticated: boolean
  /** Granular status of the admin session. */
  sessionStatus: AdminSessionStatus
  /**
   * Legacy 4-value status for backward compatibility with AdminGuard and
   * connect-button components.
   *
   * - `'disconnected'`   — wallet not connected
   * - `'unauthenticated'` — wallet connected, no valid SIWE session
   * - `'authenticated'`  — active session (more than 60 s remaining)
   * - `'expiring'`       — active session with ≤ 60 s remaining (show warning)
   */
  status: 'disconnected' | 'unauthenticated' | 'authenticated' | 'expiring'
  /**
   * Seconds remaining until the access token expires.
   * 0 when no active session.
   */
  timeLeft: number
  /** True while a signature request is in-flight. */
  isSigningIn: boolean
  /** Human-readable error from the most recent signIn attempt, if any. */
  error: string | null
  /** Trigger the EIP-4361 sign-in flow for the currently connected address. */
  signIn: () => Promise<void>
  /**
   * Alias for `signIn` — retained for backward compatibility with components
   * that call `login()` (e.g. AdminGuard, connect-button).
   */
  login: () => Promise<void>
  /** Clear the session and disconnect the wallet. */
  logout: () => Promise<void>
  /** Mark the current session as expired (e.g. after a 401 from the backend). */
  markExpired: () => void
}

const SiweAuthContext = createContext<SiweAuthContextValue | undefined>(
  undefined,
)

const queryClient = new QueryClient()

// ── SiweAuthProvider ──────────────────────────────────────────────────────────

export function SiweAuthProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected, chainId } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { disconnect } = useDisconnect()
  const [state, dispatch] = useReducer(siweSessionReducer, initialSiweSessionState)

  // Countdown timer (seconds until access token expires)
  const timeLeft = useTimeLeft(state.authSession)

  // Guard against concurrent refresh attempts in the same tab
  const isRefreshing = useRef(false)
  // Renewal timer handle
  const renewalTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // BroadcastChannel reference — created once, torn down on unmount
  const channelRef = useRef<BroadcastChannel | null>(null)

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Broadcast to peer tabs (fire-and-forget; swallows errors). */
  const broadcast = useCallback((msg: AuthBroadcastMessage) => {
    try {
      channelRef.current?.postMessage(msg)
    } catch {
      // BroadcastChannel may throw in some edge cases (e.g. detached page)
    }
  }, [])

  /** Cancel any pending renewal timer. */
  const cancelRenewal = useCallback(() => {
    if (renewalTimer.current !== null) {
      clearTimeout(renewalTimer.current)
      renewalTimer.current = null
    }
  }, [])

  // ── Silent refresh ──────────────────────────────────────────────────────────

  /**
   * Attempt a silent token renewal using the stored refresh token.
   * On success: updates reducer state, persists session, broadcasts.
   * On failure: transitions to 'expired', broadcasts sign-out.
   */
  const performSilentRefresh = useCallback(
    async (session: SiweAuthSession) => {
      if (isRefreshing.current) return
      if (!session.refreshToken || isRefreshTokenExpired(session)) {
        dispatch({ type: 'mark-expired' })
        clearAuthSession()
        broadcast({ type: 'signed-out' })
        return
      }

      isRefreshing.current = true
      try {
        const api = getApi(session.address)
        const refreshed = await api.siweRefresh(session.refreshToken)
        storeAuthSession(refreshed)
        dispatch({ type: 'refresh-success', session: refreshed })
        broadcast({ type: 'refreshed', session: refreshed })
        scheduleRenewal(refreshed)
      } catch {
        // 401 or network failure — session cannot be renewed
        clearAuthSession()
        dispatch({ type: 'mark-expired' })
        broadcast({ type: 'signed-out' })
      } finally {
        isRefreshing.current = false
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [broadcast],
  )

  /**
   * Schedule a proactive refresh 60 s before the access token expires.
   * The timer is reset whenever a session is applied (sign-in or refresh).
   */
  const scheduleRenewal = useCallback(
    (session: SiweAuthSession) => {
      cancelRenewal()
      if (isRefreshTokenExpired(session)) return // no renewal possible

      const delay = msUntilRenewal(session, 60_000)
      if (delay <= 0) {
        // Already within the renewal window — attempt immediately
        void performSilentRefresh(session)
        return
      }

      renewalTimer.current = setTimeout(() => {
        // Re-read from sessionStorage in case a peer tab already refreshed
        const current = loadAuthSessionIncludingExpired()
        if (current) void performSilentRefresh(current)
      }, delay)
    },
    [cancelRenewal, performSilentRefresh],
  )

  // ── Hydrate from sessionStorage on mount ───────────────────────────────────

  useEffect(() => {
    const stored = loadAuthSession()
    if (stored) {
      dispatch({ type: 'restore', session: stored })
      scheduleRenewal(stored)
      return
    }

    // Access token expired but refresh token may still be valid
    const raw = loadAuthSessionIncludingExpired()
    if (raw && !isRefreshTokenExpired(raw)) {
      void performSilentRefresh(raw)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── BroadcastChannel — receive messages from peer tabs ─────────────────────

  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return

    const channel = new BroadcastChannel(AUTH_CHANNEL_NAME)
    channelRef.current = channel

    channel.onmessage = (event: MessageEvent<AuthBroadcastMessage>) => {
      const msg = event.data
      if (!msg?.type) return

      if (msg.type === 'signed-in' || msg.type === 'refreshed') {
        storeAuthSession(msg.session)
        dispatch({ type: 'restore', session: msg.session })
        scheduleRenewal(msg.session)
      } else if (msg.type === 'signed-out') {
        cancelRenewal()
        clearAuthSession()
        dispatch({ type: 'clear' })
      }
    }

    return () => {
      channel.close()
      channelRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Invalidation event from same tab (lib/session.ts fires this) ───────────

  useEffect(() => {
    const onInvalidated = () => dispatch({ type: 'mark-expired' })
    window.addEventListener('siwe:invalidated', onInvalidated)
    return () => window.removeEventListener('siwe:invalidated', onInvalidated)
  }, [])

  // ── Drop session when wallet disconnects or switches address ───────────────

  useEffect(() => {
    const session = state.authSession
    if (!session) return
    if (
      !isConnected ||
      (address && session.address.toLowerCase() !== address.toLowerCase())
    ) {
      cancelRenewal()
      clearAuthSession()
      dispatch({ type: 'clear' })
      broadcast({ type: 'signed-out' })
    }
  }, [address, isConnected, state.authSession, cancelRenewal, broadcast])

  // ── Expiry polling — mark expired once the access token clock runs out ─────

  useEffect(() => {
    const session = state.authSession
    if (!session) return

    const check = () => {
      if (new Date(session.expiresAt).getTime() <= Date.now()) {
        // Try a silent refresh before marking expired
        void performSilentRefresh(session)
      }
    }

    check()
    const interval = setInterval(check, 1000)
    return () => clearInterval(interval)
  }, [state.authSession, performSilentRefresh])

  // ── Sign-in ─────────────────────────────────────────────────────────────────

  const signIn = useCallback(async () => {
    if (!address) return
    dispatch({ type: 'sign-in-start' })
    try {
      const api = getApi(address)
      const nonce = await api.getNonce(address)
      const message = buildSiweMessage({
        domain: config.siwe.domain,
        address,
        statement: config.siwe.statement,
        uri:
          typeof window !== 'undefined'
            ? window.location.origin
            : `https://${config.siwe.domain}`,
        chainId: chainId ?? 1,
        nonce,
        issuedAt: new Date().toISOString(),
      })
      const signature = await signMessageAsync({ message })
      const session = await api.siweVerify(message, signature)
      storeAuthSession(session)
      dispatch({ type: 'sign-in-success', session })
      scheduleRenewal(session)
      broadcast({ type: 'signed-in', session })
    } catch (err) {
      dispatch({
        type: 'sign-in-error',
        message: isApiError(err)
          ? err.safeMessage
          : 'Sign-in was cancelled or failed. Please try again.',
      })
    }
  }, [address, chainId, signMessageAsync, scheduleRenewal, broadcast])

  // ── Logout ──────────────────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    cancelRenewal()
    const token = state.authSession?.token
    clearAuthSession()
    dispatch({ type: 'clear' })
    broadcast({ type: 'signed-out' })
    disconnect()
    if (token) {
      await getApi(address).siweLogout(token).catch(() => {
        // best-effort server-side invalidation
      })
    }
  }, [address, state.authSession, cancelRenewal, broadcast, disconnect])

  // ── markExpired ─────────────────────────────────────────────────────────────

  const markExpired = useCallback(() => {
    cancelRenewal()
    // Attempt a silent refresh if a refresh token is still available
    const raw = loadAuthSessionIncludingExpired()
    if (raw && !isRefreshTokenExpired(raw)) {
      void performSilentRefresh(raw)
    } else {
      clearAuthSession()
      dispatch({ type: 'mark-expired' })
      broadcast({ type: 'signed-out' })
    }
  }, [cancelRenewal, performSilentRefresh, broadcast])

  // ── Derived values ──────────────────────────────────────────────────────────

  const sessionStatus = deriveSessionStatus(state, isConnected)

  const legacyStatus: SiweAuthContextValue['status'] =
    sessionStatus === 'authenticated' && timeLeft > 0 && timeLeft <= 60
      ? 'expiring'
      : sessionStatus === 'authenticated'
        ? 'authenticated'
        : isConnected
          ? 'unauthenticated'
          : 'disconnected'

  const value = useMemo<SiweAuthContextValue>(
    () => ({
      authSession: state.authSession,
      isAuthenticated: sessionStatus === 'authenticated',
      sessionStatus,
      status: legacyStatus,
      timeLeft,
      isSigningIn: state.isSigningIn,
      error: state.error,
      signIn,
      login: signIn, // backward-compat alias
      logout,
      markExpired,
    }),
    [
      state.authSession,
      state.isSigningIn,
      state.error,
      sessionStatus,
      legacyStatus,
      timeLeft,
      signIn,
      logout,
      markExpired,
    ],
  )

  return (
    <SiweAuthContext.Provider value={value}>
      {children}
    </SiweAuthContext.Provider>
  )
}

// ── useTimeLeft hook ──────────────────────────────────────────────────────────

/**
 * Tracks the number of seconds remaining until the session access token
 * expires. Updates every second while a session is active; returns 0 when
 * there is no active session.
 */
function useTimeLeft(session: SiweAuthSession | null): number {
  const [timeLeft, setTimeLeft] = useState(0)

  useEffect(() => {
    if (!session) {
      setTimeLeft(0)
      return
    }

    const tick = () => {
      const diff = new Date(session.expiresAt).getTime() - Date.now()
      setTimeLeft(Math.max(0, Math.floor(diff / 1000)))
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [session, setTimeLeft])

  return timeLeft
}

// ── Public hook ───────────────────────────────────────────────────────────────

export function useSiweAuth(): SiweAuthContextValue {
  const context = useContext(SiweAuthContext)
  if (!context) throw new Error('useSiweAuth must be used within SiweAuthProvider')
  return context
}

// ── Root providers ────────────────────────────────────────────────────────────

export function RootProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SiweAuthProvider>
          {children}
        </SiweAuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
