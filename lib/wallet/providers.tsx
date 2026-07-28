"use client";

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
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { PendingRetryCallback } from "@/lib/wallet/siwe-context";
import {
  WagmiProvider,
  createConfig,
  useSignMessage,
  useAccount,
  useDisconnect,
  useAccountEffect,
} from "wagmi";
import { walletConfig } from "@/lib/wallet/config";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { getApi } from "@/lib/api";
import { config } from "@/lib/config";
import { SiweAuthSession, AdminSessionStatus } from "@/lib/api/types";
import {
  clearAuthSession,
  getStoredToken,
  isRefreshTokenExpired,
  loadAuthSession,
  loadAuthSessionIncludingExpired,
  msUntilRenewal,
  SESSION_KEY,
  storeAuthSession,
  subscribeToAuthSessionStorage,
} from "@/lib/session";
import { isApiError } from "@/lib/api/errors";
import {
  buildSiweMessage,
  deriveSessionStatus,
  initialSiweSessionState,
  siweSessionReducer,
} from "@/lib/wallet/siwe-session";
import { SiweAuthContext } from "@/lib/wallet/siwe-context";
import { useContext } from "react";

// ── Wagmi config ──────────────────────────────────────────────────────────────

const wagmiConfig = createConfig(walletConfig);

// ── BroadcastChannel message types ───────────────────────────────────────────

type AuthBroadcastMessage =
  | { type: "signed-in"; session: SiweAuthSession }
  | { type: "refreshed"; session: SiweAuthSession }
  | { type: "signed-out" };

const AUTH_CHANNEL_NAME = "guildpass:auth";

// ── SIWE Auth Context ─────────────────────────────────────────────────────────
//
// The context, its type, and the useSiweAuth hook live in
// '@/lib/wallet/siwe-context' so they can be imported without pulling in the
// wagmi/wallet stack. This provider supplies the value.

export interface SiweAuthContextValue {
  /** The authenticated session, or null if the user has not signed in. */
  authSession: SiweAuthSession | null;
  isAuthenticated: boolean;
  /** Granular status of the admin session. */
  sessionStatus: AdminSessionStatus;
  /**
   * Legacy 4-value status for backward compatibility with AdminGuard and
   * connect-button components.
   *
   * - `'disconnected'`   — wallet not connected
   * - `'unauthenticated'` — wallet connected, no valid SIWE session
   * - `'authenticated'`  — active session (more than 60 s remaining)
   * - `'expiring'`       — active session with ≤ 60 s remaining (show warning)
   */
  status: "disconnected" | "unauthenticated" | "authenticated" | "expiring";
  /**
   * Seconds remaining until the access token expires.
   * 0 when no active session.
   */
  timeLeft: number;
  /** True when active session will expire within warningThresholdSeconds. */
  isExpiring: boolean;
  /** Warning threshold in seconds before access token expiry (default 120s / 2m). */
  warningThresholdSeconds: number;
  /** True while a signature request is in-flight. */
  isSigningIn: boolean;
  /** Human-readable error from the most recent signIn attempt, if any. */
  error: string | null;
  /** Trigger the EIP-4361 sign-in flow for the currently connected address. */
  signIn: () => Promise<void>;
  /**
   * Alias for `signIn` — retained for backward compatibility with components
   * that call `login()` (e.g. AdminGuard, connect-button).
   */
  login: () => Promise<void>;
  /** Clear the session and disconnect the wallet. */
  logout: () => Promise<void>;
  /** Mark the current session as expired (e.g. after a 401 from the backend). */
  markExpired: () => void;
  /**
   * Register a callback to be automatically retried once after the user
   * successfully re-authenticates following a 401.  The callback receives the
   * fresh session so it can supply the new token to its API call.
   *
   * Only one retry is attempted per registration — if the retried call also
   * returns a 401 the callback is discarded and a failure toast is shown via
   * the `onRetryFailure` handler passed in the registration options.
   */
  registerPendingRetry: (
    callback: PendingRetryCallback,
    options?: { onRetryFailure?: (err: unknown) => void }
  ) => void;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep data for 15 minutes to allow offline usage
      staleTime: 1000 * 60 * 15,
      gcTime: 1000 * 60 * 60 * 24,
    },
  },
});

// Create a persister that uses localStorage (only on the client)
const persister = typeof window !== 'undefined'
  ? createSyncStoragePersister({ storage: window.localStorage })
  : undefined;

// ── SiweAuthProvider ──────────────────────────────────────────────────────────

export function SiweAuthProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const [state, dispatch] = useReducer(
    siweSessionReducer,
    initialSiweSessionState,
  );

  // Countdown timer (seconds until access token expires)
  const timeLeft = useTimeLeft(state.authSession);

  // Guard against concurrent refresh attempts in the same tab
  const isRefreshing = useRef(false);
  // Guard against concurrent sign-in attempts (prevents racing nonce fetches)
  const isSigningIn = useRef(false);
  // Renewal timer handle
  const renewalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // BroadcastChannel reference — created once, torn down on unmount
  const channelRef = useRef<BroadcastChannel | null>(null);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Broadcast to peer tabs (fire-and-forget; swallows errors). */
  const broadcast = useCallback((msg: AuthBroadcastMessage) => {
    try {
      channelRef.current?.postMessage(msg);
    } catch {
      // BroadcastChannel may throw in some edge cases (e.g. detached page)
    }
  }, []);

  /** Cancel any pending renewal timer. */
  const cancelRenewal = useCallback(() => {
    if (renewalTimer.current !== null) {
      clearTimeout(renewalTimer.current);
      renewalTimer.current = null;
    }
  }, []);

  // ── Silent refresh ──────────────────────────────────────────────────────────

  /**
   * Attempt a silent token renewal using the stored refresh token.
   * On success: updates reducer state, persists session, broadcasts.
   * On failure: transitions to 'expired', broadcasts sign-out.
   */
  const performSilentRefresh = useCallback(
    async (session: SiweAuthSession) => {
      if (isRefreshing.current) return;
      if (!session.refreshToken || isRefreshTokenExpired(session)) {
        dispatch({ type: "mark-expired" });
        clearAuthSession();
        broadcast({ type: "signed-out" });
        return;
      }

      isRefreshing.current = true;
      try {
        const api = getApi(session.address);
        const refreshed = await api.siweRefresh(session.refreshToken);
        storeAuthSession(refreshed);
        dispatch({ type: "refresh-success", session: refreshed });
        broadcast({ type: "refreshed", session: refreshed });
        scheduleRenewal(refreshed);

        // A silent refresh also counts as session recovery — drain any pending
        // retry callbacks that were registered before the 401 was surfaced.
        const retries = pendingRetriesRef.current;
        pendingRetriesRef.current = [];
        for (const entry of retries) {
          try {
            await entry.callback(refreshed);
          } catch (retryErr) {
            entry.onRetryFailure?.(retryErr);
          }
        }
      } catch {
        // 401 or network failure — session cannot be renewed
        clearAuthSession();
        dispatch({ type: "mark-expired" });
        broadcast({ type: "signed-out" });
      } finally {
        isRefreshing.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [broadcast],
  );

  /**
   * Schedule a proactive refresh 60 s before the access token expires.
   * The timer is reset whenever a session is applied (sign-in or refresh).
   */
  const scheduleRenewal = useCallback(
    (session: SiweAuthSession) => {
      cancelRenewal();
      if (isRefreshTokenExpired(session)) return; // no renewal possible

      const delay = msUntilRenewal(session, 60_000);
      if (delay <= 0) {
        // Already within the renewal window — attempt immediately
        void performSilentRefresh(session);
        return;
      }

      renewalTimer.current = setTimeout(() => {
        // Re-read from sessionStorage in case a peer tab already refreshed
        const current = loadAuthSessionIncludingExpired();
        if (current) void performSilentRefresh(current);
      }, delay);
    },
    [cancelRenewal, performSilentRefresh],
  );

  // ── Hydrate from sessionStorage on mount ───────────────────────────────────

  useEffect(() => {
    const stored = loadAuthSession();
    if (stored) {
      dispatch({ type: "restore", session: stored });
      scheduleRenewal(stored);
      return;
    }

    // Access token expired but refresh token may still be valid
    const raw = loadAuthSessionIncludingExpired();
    if (raw && !isRefreshTokenExpired(raw)) {
      void performSilentRefresh(raw);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── BroadcastChannel — receive messages from peer tabs ─────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;

    const applyIncomingSession = (session: SiweAuthSession | null) => {
      if (!session) {
        cancelRenewal();
        clearAuthSession();
        dispatch({ type: "clear" });
        return;
      }
      if (
        typeof session.token !== "string" ||
        !session.token.trim() ||
        typeof session.address !== "string" ||
        !session.address.trim() ||
        typeof session.expiresAt !== "string" ||
        !session.expiresAt.trim()
      ) {
        return;
      }
      // If a wallet is currently connected in this tab, discard sessions for other addresses
      if (address && session.address.toLowerCase() !== address.toLowerCase()) {
        return;
      }
      storeAuthSession(session);
      dispatch({ type: "restore", session });
      scheduleRenewal(session);
    };

    const onStorageMessage = (event: StorageEvent) => {
      if (event.key && event.key !== SESSION_KEY) return;
      if (event.newValue === null) {
        applyIncomingSession(null);
        return;
      }
      try {
        const parsed = JSON.parse(event.newValue ?? "") as SiweAuthSession;
        applyIncomingSession(parsed);
      } catch {
        // Ignore malformed peer-session payloads.
      }
    };

    const unsubscribeStorage = subscribeToAuthSessionStorage(onStorageMessage);

    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
      channelRef.current = channel;

      channel.onmessage = (event: MessageEvent<AuthBroadcastMessage>) => {
        const msg = event.data;
        if (!msg?.type) return;

        if (msg.type === "signed-in" || msg.type === "refreshed") {
          applyIncomingSession(msg.session);
        } else if (msg.type === "signed-out") {
          applyIncomingSession(null);
        }
      };

      return () => {
        unsubscribeStorage();
        channel.close();
        channelRef.current = null;
      };
    }

    return () => {
      unsubscribeStorage();
    };
  }, [address, cancelRenewal, scheduleRenewal]);

  // ── Invalidation event from same tab (lib/session.ts fires this) ───────────

  useEffect(() => {
    const onInvalidated = () => dispatch({ type: "mark-expired" });
    window.addEventListener("siwe:invalidated", onInvalidated);
    return () => window.removeEventListener("siwe:invalidated", onInvalidated);
  }, []);

  // ── Drop session when wallet disconnects or switches address ───────────────

  useAccountEffect({
    onDisconnect() {
      if (state.authSession) {
        cancelRenewal();
        clearAuthSession();
        dispatch({ type: "clear" });
        broadcast({ type: "signed-out" });
      }
    },
  });

  useEffect(() => {
    const session = state.authSession;
    if (!session) return;
    if (address && session.address.toLowerCase() !== address.toLowerCase()) {
      cancelRenewal();
      clearAuthSession();
      dispatch({ type: "clear" });
      broadcast({ type: "signed-out" });
    }
  }, [address, state.authSession, cancelRenewal, broadcast]);

  // ── Expiry polling — mark expired once the access token clock runs out ─────

  useEffect(() => {
    const session = state.authSession;
    if (!session) return;

    const check = () => {
      if (new Date(session.expiresAt).getTime() <= Date.now()) {
        // Try a silent refresh before marking expired
        void performSilentRefresh(session);
      }
    };

    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [state.authSession, performSilentRefresh]);

  // ── Security validation helpers ───────────────────────────────────────────────

  /**
   * Validates that the configured SIWE domain matches the actual runtime origin.
   * This prevents phishing attacks where a malicious site presents a SIWE message
   * with a domain field that doesn't match the site the user is actually on.
   *
   * @throws {Error} If domain mismatch is detected (security error)
   */
  const validateSiweDomain = useCallback(() => {
    if (typeof window === "undefined") return; // Skip validation on server

    const configuredDomain = config.siwe.domain;
    const actualHost = window.location.host;

    // Normalize both for comparison (handle port differences consistently)
    const normalizeDomain = (d: string) => d.toLowerCase().replace(/^https?:\/\//, "");
    const normalizedConfigured = normalizeDomain(configuredDomain);
    const normalizedActual = normalizeDomain(actualHost);

    if (normalizedConfigured !== normalizedActual) {
      throw new Error(
        [
          "🔒 Security Error: Domain Mismatch",
          "",
          `The configured SIWE domain (${configuredDomain}) does not match the current site (${actualHost}).`,
          "",
          "This indicates either:",
          "  • A misconfiguration (NEXT_PUBLIC_SIWE_DOMAIN is stale or incorrect)",
          "  • A phishing attempt or proxying scenario",
          "",
          "For your security, sign-in is blocked. Please contact the site administrator if this persists.",
        ].join("\n")
      );
    }
  }, []);

  /**
   * Validates that the wallet's current chainId matches the chainId we're about to
   * embed in the SIWE message. This prevents signature replay across chains.
   *
   * Re-checks immediately before signature request (not just at flow start) since
   * users can switch chains mid-session.
   *
   * @param messageChainId - The chainId embedded in the SIWE message
   * @throws {Error} If chainId mismatch is detected (security error)
   */
  const validateChainId = useCallback((messageChainId: number) => {
    const currentChainId = chainId;
    if (currentChainId === undefined) {
      throw new Error(
        "🔒 Security Error: Unable to determine wallet chain. Please ensure your wallet is connected."
      );
    }

    if (currentChainId !== messageChainId) {
      throw new Error(
        [
          "🔒 Security Error: Chain Mismatch",
          "",
          `Your wallet is connected to chain ${currentChainId}, but the sign-in request is for chain ${messageChainId}.`,
          "",
          "This prevents signature replay across different chains.",
          "Please switch your wallet to the correct chain and try again.",
        ].join("\n")
      );
    }
  }, [chainId]);

  // ── Pending-retry queue ──────────────────────────────────────────────────────
  //
  // When a mutation fails with 401, it may register a retry callback here
  // before calling markExpired().  After a successful re-auth, signIn() drains
  // this queue by invoking each callback with the fresh session.  A second 401
  // on the retry call invokes the registered onRetryFailure handler instead of
  // looping forever.

  type RetryEntry = {
    callback: PendingRetryCallback;
    onRetryFailure?: (err: unknown) => void;
  };
  const pendingRetriesRef = useRef<RetryEntry[]>([]);

  const registerPendingRetry = useCallback(
    (callback: PendingRetryCallback, options?: { onRetryFailure?: (err: unknown) => void }) => {
      pendingRetriesRef.current = [
        ...pendingRetriesRef.current,
        { callback, onRetryFailure: options?.onRetryFailure },
      ];
    },
    [],
  );

  // ── Sign-in ─────────────────────────────────────────────────────────────────

  const signIn = useCallback(async () => {
    if (!address) return;
    if (isSigningIn.current) return;
    isSigningIn.current = true;
    dispatch({ type: "sign-in-start" });
    try {
      // Security check: validate domain matches runtime origin
      validateSiweDomain();

      const api = getApi(address);
      const nonce = await api.getNonce(address);

      const messageChainId = chainId ?? 1;
      const message = buildSiweMessage({
        domain: config.siwe.domain,
        address,
        statement: config.siwe.statement,
        uri:
          typeof window !== "undefined"
            ? window.location.origin
            : `https://${config.siwe.domain}`,
        chainId: messageChainId,
        nonce,
        issuedAt: new Date().toISOString(),
      });

      // Security check: re-validate chainId immediately before signature
      // (user may have switched chains after message construction)
      validateChainId(messageChainId);

      const signature = await signMessageAsync({ message });
      const session = await api.siweVerify(message, signature);
      storeAuthSession(session);
      dispatch({ type: "sign-in-success", session });
      scheduleRenewal(session);
      broadcast({ type: "signed-in", session });

      // Drain any pending retry callbacks registered before re-auth.
      // We take the entire queue atomically so a second 401 inside a callback
      // does not enqueue another retry and cause an infinite loop.
      const retries = pendingRetriesRef.current;
      pendingRetriesRef.current = [];
      for (const entry of retries) {
        try {
          await entry.callback(session);
        } catch (retryErr) {
          // The retried call failed — invoke the registered failure handler
          // rather than silently swallowing the error.
          entry.onRetryFailure?.(retryErr);
        }
      }
    } catch (err) {
      dispatch({
        type: "sign-in-error",
        message: isApiError(err)
          ? err.safeMessage
          : err instanceof Error
            ? err.message
            : "Sign-in was cancelled or failed. Please try again.",
      });
    } finally {
      isSigningIn.current = false;
    }
  }, [address, chainId, signMessageAsync, scheduleRenewal, broadcast, validateSiweDomain, validateChainId]);

  // ── Logout ──────────────────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    cancelRenewal();
    const token = getStoredToken();
    clearAuthSession();
    dispatch({ type: "clear" });
    broadcast({ type: "signed-out" });
    disconnect();
    if (token) {
      await getApi(address)
        .siweLogout(token)
        .catch(() => {
          // best-effort server-side invalidation
        });
    }
  }, [address, cancelRenewal, broadcast, disconnect]);

  // ── markExpired ─────────────────────────────────────────────────────────────

  const markExpired = useCallback(() => {
    cancelRenewal();
    // Attempt a silent refresh if a refresh token is still available
    const raw = loadAuthSessionIncludingExpired();
    if (raw && !isRefreshTokenExpired(raw)) {
      void performSilentRefresh(raw);
    } else {
      clearAuthSession();
      dispatch({ type: "mark-expired" });
      broadcast({ type: "signed-out" });
    }
  }, [cancelRenewal, performSilentRefresh, broadcast]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const sessionStatus = deriveSessionStatus(state, isConnected);
  const warningThresholdSeconds = config.siwe.warningThresholdSeconds ?? 120;
  const isExpiring =
    sessionStatus === "authenticated" &&
    timeLeft > 0 &&
    timeLeft <= warningThresholdSeconds;

  const legacyStatus: SiweAuthContextValue["status"] = isExpiring
    ? "expiring"
    : sessionStatus === "authenticated"
      ? "authenticated"
      : isConnected
        ? "unauthenticated"
        : "disconnected";

  const value = useMemo<SiweAuthContextValue>(
    () => ({
      authSession: state.authSession,
      isAuthenticated: sessionStatus === "authenticated",
      sessionStatus,
      status: legacyStatus,
      timeLeft,
      isExpiring,
      warningThresholdSeconds,
      isSigningIn: state.isSigningIn,
      error: state.error,
      signIn,
      login: signIn, // backward-compat alias
      logout,
      markExpired,
      registerPendingRetry,
    }),
    [
      state.authSession,
      state.isSigningIn,
      state.error,
      sessionStatus,
      legacyStatus,
      timeLeft,
      isExpiring,
      warningThresholdSeconds,
      signIn,
      logout,
      markExpired,
      registerPendingRetry,
    ],
  );

  return (
    <SiweAuthContext.Provider value={value as any}>
      {children}
    </SiweAuthContext.Provider>
  );
}

// ── useTimeLeft hook ──────────────────────────────────────────────────────────

/**
 * Tracks the number of seconds remaining until the session access token
 * expires. Updates every second while a session is active; returns 0 when
 * there is no active session.
 */
function useTimeLeft(session: SiweAuthSession | null): number {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!session) {
      setTimeLeft(0);
      return;
    }

    const tick = () => {
      const diff = new Date(session.expiresAt).getTime() - Date.now();
      setTimeLeft(Math.max(0, Math.floor(diff / 1000)));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session, setTimeLeft]);

  return timeLeft;
}

// ── Public hook ───────────────────────────────────────────────────────────────

export function useSiweAuth(): SiweAuthContextValue {
  const context = useContext(SiweAuthContext);
  if (!context)
    throw new Error("useSiweAuth must be used within SiweAuthProvider");
  return context as unknown as SiweAuthContextValue;
}

// ── Root providers ────────────────────────────────────────────────────────────

export function RootProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SiweAuthProvider>{children}</SiweAuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
