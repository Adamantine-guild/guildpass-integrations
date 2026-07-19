/**
 * lib/api/siwe-debug.ts
 *
 * Dev-only, in-memory capture of the most recent SIWE sign-in artifacts so the
 * /developer debug panel can display them (#132).
 *
 * Design constraints (from the issue):
 * - Mock mode ONLY. recordSiweDebug is a no-op unless config.apiMode === 'mock',
 *   so nothing is captured or retained in live builds.
 * - NOT persisted. State lives at module scope only — never written to
 *   localStorage or sessionStorage — so it is discarded when the tab closes.
 * - No sensitive data beyond the session/tab.
 *
 * The store exposes a useSyncExternalStore-compatible subscribe/getSnapshot
 * pair so a panel can live-update the moment a new sign-in is recorded, without
 * a manual refresh.
 */
import { config } from '../config'

export interface SiweDebugEntry {
  /** The raw EIP-4361 message that was presented to the wallet for signing. */
  message: string
  /** The nonce embedded in the message. */
  nonce: string
  /** The mock session token issued by siweVerify. */
  token: string
  /** ISO 8601 expiry of the issued token. */
  expiresAt: string
  /** When this entry was captured (ISO 8601), for display ordering. */
  capturedAt: string
}

let current: SiweDebugEntry | null = null
const listeners = new Set<() => void>()

/** Notify all subscribers that the snapshot changed. */
function emit(): void {
  listeners.forEach((listener) => listener())
}

/**
 * Record the latest SIWE sign-in artifacts. No-op outside mock mode.
 *
 * Call this from the sign-in flow once the message/nonce/token/expiry are known.
 * `capturedAt` is stamped here so callers don't have to.
 */
export function recordSiweDebug(
  entry: Omit<SiweDebugEntry, 'capturedAt'>,
): void {
  if (config.apiMode !== 'mock') return
  current = { ...entry, capturedAt: new Date().toISOString() }
  emit()
}

/** Clear the captured entry (e.g. on logout). No-op outside mock mode. */
export function clearSiweDebug(): void {
  if (config.apiMode !== 'mock') return
  if (current === null) return
  current = null
  emit()
}

/** useSyncExternalStore subscribe: register a change listener, return unsubscribe. */
export function subscribeSiweDebug(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** useSyncExternalStore getSnapshot: current entry, or null if none captured. */
export function getSiweDebugSnapshot(): SiweDebugEntry | null {
  return current
}