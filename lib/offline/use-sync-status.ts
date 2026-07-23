/**
 * lib/offline/use-sync-status.ts
 *
 * React hook that tracks:
 *   - isOnline          — navigator.onLine mirrored in state
 *   - lastUpdatedAt     — ISO timestamp of the most recent successful
 *                         background cache refresh, or null if not yet synced
 *   - isSyncing         — true while a background refresh is in-flight
 *                         (optimistic: set to true on reconnect, cleared when
 *                         the service worker posts CACHE_UPDATED or after a
 *                         short timeout)
 *
 * The hook listens for:
 *   - 'online' / 'offline' window events
 *   - 'message' events from the service worker (type === 'CACHE_UPDATED')
 *
 * The lastUpdatedAt value is persisted in localStorage so it survives a page
 * reload (the user can see "last updated X minutes ago" even on a fresh load
 * while offline).
 */

'use client'

import { backendOnline } from '@/lib/api/backendStatus';

// Existing imports
import { useCallback, useEffect, useRef, useState } from 'react'

// ... rest of file unchanged ...

const LS_KEY = 'guildpass:cache-last-updated'
const SYNC_TIMEOUT_MS = 8_000

function readPersistedTimestamp(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(LS_KEY)
  } catch {
    return null
  }
}

function persistTimestamp(iso: string): void {
  try {
    localStorage.setItem(LS_KEY, iso)
  } catch {
    // Storage may be blocked in private browsing — treat as non-fatal.
  }
}

export interface SyncStatus {
  /** Whether the browser currently has a network connection. */
  isOnline: boolean
  /**
   * ISO timestamp of the most recent successful background cache write,
   * or null if no sync has been recorded yet.
   */
  lastUpdatedAt: string | null
  /**
   * True while a background re-sync is in progress after coming back online.
   * Cleared when the SW sends CACHE_UPDATED or after SYNC_TIMEOUT_MS.
   */
  isSyncing: boolean
}

export function useSyncStatus(): SyncStatus {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine && backendOnline.get() : true,
  );

  // Sync with backend health status
  useEffect(() => {
    const handleBackendChange = (online: boolean) => {
      setIsOnline(prev => {
        const navigatorOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
        return navigatorOnline && online;
      });
    };
    const unsubscribe = backendOnline.subscribe(handleBackendChange);
    return unsubscribe;
  }, []);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(
    readPersistedTimestamp,
  )
  const [isSyncing, setIsSyncing] = useState(false)

  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearSyncTimeout = useCallback(() => {
    if (syncTimeoutRef.current !== null) {
      clearTimeout(syncTimeoutRef.current)
      syncTimeoutRef.current = null
    }
  }, [])

  const markUpdated = useCallback(
    (timestamp?: number) => {
      const iso = new Date(timestamp ?? Date.now()).toISOString()
      setLastUpdatedAt(iso)
      persistTimestamp(iso)
      setIsSyncing(false)
      clearSyncTimeout()
    },
    [clearSyncTimeout],
  )

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      // Signal that a sync is in-flight — the SW will revalidate cached
      // responses in the background.
      setIsSyncing(true)
      clearSyncTimeout()
      // Fallback: if the SW does not post CACHE_UPDATED within SYNC_TIMEOUT_MS
      // (e.g. no SW, or all cache entries are already fresh), stop the spinner.
      syncTimeoutRef.current = setTimeout(() => {
        setIsSyncing(false)
      }, SYNC_TIMEOUT_MS)
    }

    const handleOffline = () => {
      setIsOnline(false)
      setIsSyncing(false)
      clearSyncTimeout()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [clearSyncTimeout])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'CACHE_UPDATED') {
        markUpdated(event.data.timestamp as number | undefined)
      }
    }

    navigator.serviceWorker.addEventListener('message', handleMessage)
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage)
    }
  }, [markUpdated])

  // Cleanup on unmount
  useEffect(() => () => clearSyncTimeout(), [clearSyncTimeout])

  return { isOnline, lastUpdatedAt, isSyncing }
}
