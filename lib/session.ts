/**
 * lib/session.ts
 *
 * Thin helpers for persisting a SIWE auth session in sessionStorage.
 *
 * Storage strategy
 * ────────────────
 * A single JSON blob is stored under SESSION_KEY.  The blob now includes the
 * optional `refreshToken` / `refreshExpiresAt` fields introduced in issue #166.
 * Existing persisted sessions that pre-date refresh-token support are still
 * valid — `refreshToken` is optional on `SiweAuthSession`, so they will load
 * normally but will not support silent renewal.
 *
 * Tab-scoping vs. cross-tab sync
 * ──────────────────────────────
 * sessionStorage is deliberately tab-scoped: a token is cleared when the tab
 * or browser is closed, which reduces the risk of a stale privileged session
 * lingering on a shared machine.
 *
 * Cross-tab synchronisation is handled at a higher level by the
 * BroadcastChannel in `lib/wallet/providers.tsx`.  When a sign-in, sign-out,
 * or silent refresh occurs in any tab, the provider broadcasts the updated
 * session; peer tabs write the received session via `storeAuthSession()` so
 * every tab eventually converges on the same state.
 */

import type { SiweAuthSession } from './api/types'

const SESSION_KEY = 'guildpass:siwe-session'

// ── Persist ───────────────────────────────────────────────────────────────────

/** Persist an authenticated session (including any refresh token) to sessionStorage. */
export function storeAuthSession(session: SiweAuthSession): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Silently ignore storage quota / private-mode errors
  }
}

// ── Load ──────────────────────────────────────────────────────────────────────

/**
 * Load a persisted session.  Returns `null` if:
 * - Nothing is stored
 * - The stored value is malformed
 * - The *access* token has already expired (optimistic client-side guard)
 *
 * A session whose access token is expired but whose refresh token is still
 * valid is **also** returned as `null` here — the SiweAuthProvider is
 * responsible for detecting that the access token is stale and attempting a
 * silent refresh before marking the session usable.
 *
 * Use `loadAuthSessionIncludingExpired()` when you need the raw stored value
 * (e.g. to extract a refresh token for a renewal attempt).
 */
export function loadAuthSession(): SiweAuthSession | null {
  const session = loadAuthSessionIncludingExpired()
  if (!session) return null
  if (isAccessTokenExpired(session)) {
    // Don't clear — the refresh token may still be valid.  The caller decides.
    return null
  }
  return session
}

/**
 * Load the raw stored session without any expiry filtering.
 * Useful when you need to retrieve the refresh token even after the access
 * token has expired.
 */
export function loadAuthSessionIncludingExpired(): SiweAuthSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SiweAuthSession
    // Guard against missing required fields or invalid types
    if (
      !parsed ||
      typeof parsed.token !== 'string' ||
      !parsed.token.trim() ||
      typeof parsed.address !== 'string' ||
      !parsed.address.trim() ||
      typeof parsed.expiresAt !== 'string' ||
      !parsed.expiresAt.trim()
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

// ── Clear ─────────────────────────────────────────────────────────────────────

/** Remove the stored session from sessionStorage. */
export function clearAuthSession(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(SESSION_KEY)
    try {
      // Notify same-tab listeners that the session was cleared/invalidated.
      window.dispatchEvent(new CustomEvent('siwe:invalidated'))
    } catch {
      // Ignore environments that disallow CustomEvent
    }
  } catch {
    // Silently ignore
  }
}

/** Convenience to clear session and notify listeners explicitly. */
export function invalidateAuthSession(): void {
  clearAuthSession()
}

/**
 * Returns the raw bearer token from the stored session, or `null` if no
 * session exists.  This is the narrowest possible read operation — callers
 * that only need the token string should prefer this over loading the full
 * session object so the storage implementation can be swapped later
 * (e.g. to httpOnly cookies) without touching call sites.
 */
export function getStoredToken(): string | null {
  const session = loadAuthSessionIncludingExpired()
  return session?.token ?? null
}

/**
 * Returns the wallet address from the stored session, or `null` if no
 * session exists.
 */
export function getStoredAddress(): string | null {
  const session = loadAuthSessionIncludingExpired()
  return session?.address ?? null
}

// ── Expiry helpers ────────────────────────────────────────────────────────────

/**
 * Returns `true` if the session's *access* token has expired (or will expire
 * within the provided `bufferMs` grace window, defaulting to 0).
 *
 * The default 0 ms is intentional for precise checks.  The renewal timer uses
 * a 60 000 ms buffer to trigger a proactive refresh before users notice.
 */
export function isAccessTokenExpired(
  session: Pick<SiweAuthSession, 'expiresAt'>,
  bufferMs = 0,
): boolean {
  return new Date(session.expiresAt).getTime() - bufferMs <= Date.now()
}

/**
 * Returns `true` if the session's *refresh* token has expired (or is absent).
 *
 * When this returns `true` the only way to obtain a new session is a fresh
 * wallet signature.
 */
export function isRefreshTokenExpired(
  session: Pick<SiweAuthSession, 'refreshToken' | 'refreshExpiresAt'>,
  bufferMs = 0,
): boolean {
  if (!session.refreshToken || !session.refreshExpiresAt) return true
  return new Date(session.refreshExpiresAt).getTime() - bufferMs <= Date.now()
}

/**
 * Returns the number of milliseconds until the access token should be
 * proactively refreshed (i.e. `expiresAt − renewalLeadMs`).
 *
 * Returns 0 (or a negative number) if the renewal window has already passed.
 */
export function msUntilRenewal(
  session: Pick<SiweAuthSession, 'expiresAt'>,
  renewalLeadMs = 60_000,
): number {
  return new Date(session.expiresAt).getTime() - Date.now() - renewalLeadMs
}
