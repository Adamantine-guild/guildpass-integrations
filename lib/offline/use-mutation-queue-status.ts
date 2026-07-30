/**
 * lib/offline/use-mutation-queue-status.ts
 *
 * React hook exposing the durable mutation queue's pending count and
 * whether a replay is currently draining it — shared by
 * components/ui/sync-status-banner.tsx (display) and
 * components/offline/mutation-queue-sync.tsx (which drives the drain).
 * Kept separate from lib/offline/use-sync-status.ts since that hook is
 * connectivity-only; this one is queue-state-only. Both are plain
 * subscriptions, so using them together never double-fires re-renders.
 */

'use client'

import { useEffect, useState } from 'react'
import { mutationQueue } from './mutation-queue'
import { isReplayingMutationQueue, subscribeMutationReplayState } from './mutation-replay'

export interface MutationQueueStatus {
  /** Number of mutations currently queued for offline replay. */
  queuedCount: number
  /** True while the queue is actively being drained. */
  isReplaying: boolean
}

export function useMutationQueueStatus(): MutationQueueStatus {
  const [queuedCount, setQueuedCount] = useState(0)
  const [isReplaying, setIsReplaying] = useState(isReplayingMutationQueue)

  useEffect(() => {
    let cancelled = false
    const refreshCount = () => {
      mutationQueue.count().then((count) => {
        if (!cancelled) setQueuedCount(count)
      })
    }

    refreshCount()
    const unsubscribeQueue = mutationQueue.subscribe(refreshCount)
    const unsubscribeReplay = subscribeMutationReplayState(() => {
      setIsReplaying(isReplayingMutationQueue())
      // A drain starting or finishing always changes (or is about to
      // change) the queue count too.
      refreshCount()
    })

    return () => {
      cancelled = true
      unsubscribeQueue()
      unsubscribeReplay()
    }
  }, [])

  return { queuedCount, isReplaying }
}
