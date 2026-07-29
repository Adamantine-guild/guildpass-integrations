/**
 * lib/wallet/refresh-coordination.ts
 *
 * Cross-tab coordination for silent SIWE refresh-token rotation.
 *
 * `isRefreshing` in providers.tsx guards against duplicate refresh calls
 * *within* a single tab, but each browser tab runs its own SiweAuthProvider
 * instance with its own ref — two tabs can independently reach the proactive
 * renewal window and both submit the same one-time-use refresh token before
 * either sees the other's BroadcastChannel `refreshed` message.
 *
 * This module adds cross-tab exclusivity via the Web Locks API (scoped per
 * address, since different tabs may hold sessions for different wallets) and
 * a freshness check so a tab that was queued behind the lock can detect that
 * a peer already completed the rotation and adopt that result instead of
 * replaying an already-invalidated refresh token.
 *
 * When Web Locks is unavailable, `withRefreshLock` runs the operation
 * directly. Same-tab exclusivity (via the caller's `isRefreshing` ref) still
 * holds, and the freshness check still lets a tab that loses the race adopt
 * a peer's result — it just no longer guarantees only one tab ever
 * *attempts* the network call.
 */

import { isAccessTokenExpired } from '../session'
import type { SiweAuthSession } from '../api/types'

/** Per-address Web Locks lock name for the silent-refresh critical section. */
export function refreshLockName(address: string): string {
  return `guildpass:siwe-refresh:${address.toLowerCase()}`
}

/** True when the Web Locks API is available in this environment. */
export function hasWebLocks(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.locks !== 'undefined'
}

/**
 * Run `fn` exclusively across same-origin tabs for the given address when
 * the Web Locks API is available; otherwise run `fn` directly.
 */
export async function withRefreshLock<T>(
  address: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!hasWebLocks()) return fn()
  return navigator.locks.request(refreshLockName(address), fn)
}

type SessionIdentity = Pick<SiweAuthSession, 'address' | 'expiresAt' | 'refreshToken'>

/**
 * True when `current` (freshly re-read from storage after acquiring the
 * lock) is a newer session than the one this refresh attempt started with —
 * i.e. another tab already completed the rotation while this tab was
 * queued. Compares `expiresAt` / `refreshToken` rather than trusting
 * message-arrival order, since those are the only fields that carry real
 * ordering information once a tab is past the BroadcastChannel handler.
 */
export function isSessionAlreadyRefreshed(
  current: SessionIdentity | null,
  snapshot: SessionIdentity,
): boolean {
  if (!current) return false
  if (current.address.toLowerCase() !== snapshot.address.toLowerCase()) return false
  const rotated =
    current.expiresAt !== snapshot.expiresAt || current.refreshToken !== snapshot.refreshToken
  if (!rotated) return false
  return !isAccessTokenExpired(current)
}

// ── Peer-refresh marker ──────────────────────────────────────────────────────
//
// sessionStorage is tab-scoped (by design — see lib/session.ts), so a tab
// only learns about a peer's rotated session once it has received and
// processed that peer's BroadcastChannel `refreshed` message — and that
// message can be MISSED entirely (not just delayed) if the winning tab sends
// it before this tab's own BroadcastChannel listener has been created (e.g.
// the winner finishes its whole refresh in a handful of milliseconds while
// this tab is still mid-navigation). BroadcastChannel does not queue or
// replay messages sent before a listener exists.
//
// localStorage writes, unlike BroadcastChannel messages, are synchronously
// visible to other same-origin tabs regardless of listener timing. It's used
// here purely as a fast, non-secret "a refresh just happened" signal — only
// a timestamp is ever stored, never a token — so this does not reintroduce
// the localStorage token-exposure risk the sessionStorage-only design
// deliberately avoids. Once the marker indicates a missed refresh, the
// caller actively asks peers to resend it (see `requestRebroadcast` below)
// rather than passively polling storage for a message that may never come.

const REFRESH_MARKER_PREFIX = 'guildpass:siwe-refresh-marker:'

function refreshMarkerKey(address: string): string {
  return `${REFRESH_MARKER_PREFIX}${address.toLowerCase()}`
}

/** Record that a refresh just completed for `address`. */
export function markRefreshCompleted(address: string, expiresAt: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(refreshMarkerKey(address), JSON.stringify({ expiresAt }))
  } catch {
    // Storage quota / private-mode errors — BroadcastChannel still propagates
    // the session on its own; this is only a latency optimization.
  }
}

function readRefreshMarker(address: string): { expiresAt: string } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(refreshMarkerKey(address))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return typeof parsed?.expiresAt === 'string' ? { expiresAt: parsed.expiresAt } : null
  } catch {
    return null
  }
}

/**
 * When the localStorage marker shows a peer tab completed a refresh more
 * recently than `snapshot`, call `requestRebroadcast` once (asking any
 * listening peer to resend the current session — see the
 * 'request-current-session' BroadcastChannel message in providers.tsx) and
 * briefly poll `loadCurrent` (bounded by `timeoutMs`) for this tab's own
 * storage to catch up, returning that session once fresh.
 *
 * Returns `null` immediately — no wait at all — when there's no marker
 * evidence of a more recent peer refresh, so the normal, non-racing
 * single-tab path never pays this cost. Also returns `null` if the wait
 * times out (e.g. every peer holding the fresh session closed its tab
 * before responding), letting the caller fall back to performing its own
 * refresh.
 */
export async function waitForPeerRefresh<T extends SessionIdentity>(
  address: string,
  snapshot: SessionIdentity,
  loadCurrent: () => T | null,
  requestRebroadcast: () => void,
  { timeoutMs = 2000, pollIntervalMs = 25 }: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<T | null> {
  const marker = readRefreshMarker(address)
  if (!marker || new Date(marker.expiresAt).getTime() <= new Date(snapshot.expiresAt).getTime()) {
    return null
  }

  requestRebroadcast()

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const current = loadCurrent()
    if (current && isSessionAlreadyRefreshed(current, snapshot)) {
      return current
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }
  return null
}
