'use client'

/**
 * SyncStatusBanner
 *
 * Displays connectivity, cache-freshness, and offline-mutation-queue state.
 * Renders nothing when the browser is online, not syncing, and no admin
 * mutations are queued or replaying.
 *
 * States:
 *   • Online + syncing/replaying — "Syncing…" spinner (cache refresh and/or
 *                                  queued mutation replay), auto-dismisses
 *                                  on completion
 *   • Offline + has cache        — amber banner: "Offline — showing cached
 *                                  data" + "Last updated N minutes ago"
 *   • Offline + no cache         — red banner: "Offline — no cached data
 *                                  available"
 *   • Any of the above may additionally show "<N> action(s) queued" when
 *     lib/offline/mutation-queue.ts has pending admin mutations.
 */

import { useSyncStatus } from '@/lib/offline/use-sync-status'
import { useMutationQueueStatus } from '@/lib/offline/use-mutation-queue-status'
import { cn } from '@/lib/utils'

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)

  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days !== 1 ? 's' : ''} ago`
}

function queuedActionsLabel(queuedCount: number): string {
  return `${queuedCount} action${queuedCount === 1 ? '' : 's'} queued`
}

/** Extra line appended to the offline banners noting queued admin mutations. */
function QueuedMutationsNote({ queuedCount }: { queuedCount: number }) {
  if (queuedCount <= 0) return null
  return (
    <span className="pl-4 text-xs opacity-90">
      {queuedActionsLabel(queuedCount)} — will sync automatically once you&apos;re back online.
    </span>
  )
}

export function SyncStatusBanner({ className }: { className?: string }) {
  const { isOnline, isBackendReachable, lastUpdatedAt, isSyncing } = useSyncStatus()
  const { queuedCount, isReplaying } = useMutationQueueStatus()
  // True browser connectivity, independent of backend reachability — lets us
  // tell "you're offline" apart from "the configured backend can't be reached"
  const browserOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
  const hasQueuedWork = queuedCount > 0 || isReplaying

  // Nothing to show when we are online, not mid-sync, and nothing is queued
  if (isOnline && !isSyncing && !hasQueuedWork) return null

  // Brief "syncing" indicator shown on reconnect while background fetch
  // and/or queued-mutation replay runs
  if (isOnline && (isSyncing || hasQueuedWork)) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={isReplaying ? 'Syncing queued actions' : 'Refreshing membership data'}
        className={cn(
          'flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-800/40 dark:bg-blue-900/20 dark:text-blue-200',
          className,
        )}
      >
        <svg
          className="animate-spin h-3.5 w-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
        </svg>
        <span>
          {isReplaying
            ? `Syncing ${queuedActionsLabel(queuedCount)}…`
            : queuedCount > 0
              ? `${queuedActionsLabel(queuedCount)} — waiting to sync…`
              : 'Syncing latest membership data…'}
        </span>
      </div>
    )
  }

  // Offline — show cached data state
  if (lastUpdatedAt) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Offline — showing cached membership data"
        className={cn(
          'flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-100',
          className,
        )}
      >
        <div className="flex items-center gap-2">
          {/* Offline dot */}
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500 dark:bg-amber-400"
            aria-hidden="true"
          />
          <span className="font-medium">Offline — showing cached data</span>
        </div>
        <span
          className="pl-4 text-xs text-amber-700 dark:text-amber-300"
          aria-label={`Last updated ${formatRelativeTime(lastUpdatedAt)}`}
        >
          Last updated {formatRelativeTime(lastUpdatedAt)}
        </span>
        <QueuedMutationsNote queuedCount={queuedCount} />
      </div>
    )
  }

  // Browser is online but the configured backend can't be reached — this is
  // a deployment/configuration problem (e.g. a misconfigured or unreachable
  // NEXT_PUBLIC_CORE_API_URL), not a user connectivity problem. Say so
  // explicitly rather than showing a generic offline message. See #228.
  if (browserOnline && !isBackendReachable) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        aria-label="Backend unreachable"
        className={cn(
          'flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive',
          className,
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-destructive"
            aria-hidden="true"
          />
          <span>
            Can&apos;t reach the backend service. This usually means the app is
            misconfigured — check that <code>NEXT_PUBLIC_CORE_API_URL</code> is
            set correctly for this deployment, or that the backend is running.
          </span>
        </div>
        <QueuedMutationsNote queuedCount={queuedCount} />
      </div>
    )
  }

  // Offline with no cached data at all
  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-label="Offline — no cached data available"
      className={cn(
       'flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full bg-destructive"
          aria-hidden="true"
        />
        <span>
          Offline — no cached data available. Connect to a network to load your
          membership.
        </span>
      </div>
      <QueuedMutationsNote queuedCount={queuedCount} />
    </div>
  )
}
