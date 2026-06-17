/**
 * lib/session.ts
 *
 * Thin helpers for persisting a SIWE auth session in sessionStorage.
 * Using sessionStorage (tab-scoped) deliberately — the token is cleared when
 * the tab/browser is closed, which reduces the risk of a stale privileged
 * session lingering on a shared machine.
 */

import type { SiweAuthSession } from './api/types'

const SESSION_KEY = 'guildpass:siwe-session'

/** Persist an authenticated session to sessionStorage. */
export function storeAuthSession(session: SiweAuthSession): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Silently ignore storage quota / private-mode errors
  }
}

/**
 * Load a persisted session. Returns `null` if:
 * - Nothing is stored
 * - The stored value is malformed
 * - The session has already expired (checked client-side as an optimistic guard)
 */
export function loadAuthSession(): SiweAuthSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SiweAuthSession
    // Guard against missing fields
    if (!parsed.token || !parsed.address || !parsed.expiresAt) return null
    // Optimistic expiry check — the backend should still validate the token
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      clearAuthSession()
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/** Remove the stored session from sessionStorage. */
export function clearAuthSession(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Silently ignore
  }
}
