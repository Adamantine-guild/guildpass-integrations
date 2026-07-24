'use client'
/**
 * BackendHealthCheck
 *
 * Invisible component whose only job is to run a one-time health check
 * against the configured core API on initial mount. Without this, the
 * backendOnline flag (and therefore SyncStatusBanner) only updates reactively
 * — after a user action happens to call the API. A misconfigured but
 * syntactically valid NEXT_PUBLIC_CORE_API_URL would otherwise fail silently
 * until the user clicked something. See issue #228.
 *
 * Kept as a separate component so the server-rendered layout tree does not
 * need to become a client component (same pattern as SwRegistrar).
 */
import { useEffect } from 'react'
import { ensureOnline } from '@/lib/api/backendStatus'

export function BackendHealthCheck() {
  useEffect(() => {
    ensureOnline().catch(() => {
      // Intentionally swallowed — ensureOnline() already updates the
      // backendOnline flag (which SyncStatusBanner reacts to) and throws
      // OfflineError purely for callers that need it inline. There's no
      // caller here to hand the error to.
    })
  }, [])
  return null
}