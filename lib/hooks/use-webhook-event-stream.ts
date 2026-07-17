'use client'

import { useState, useEffect, useRef } from 'react'
import { getApi } from '@/lib/api'
import { isApiError } from '@/lib/api/errors'
import {
  WebhookEventLog,
  WebhookEventStreamState,
} from '@/lib/api/types'

export interface UseWebhookEventStreamOptions {
  address?: string
  token?: string
  enabled?: boolean
}

export interface UseWebhookEventStreamResult {
  events: WebhookEventLog[]
  streamState: WebhookEventStreamState
  error: Error | null
  isLive: boolean
}

export function useWebhookEventStream({
  address,
  token,
  enabled = true,
}: UseWebhookEventStreamOptions): UseWebhookEventStreamResult {
  const [events, setEvents] = useState<WebhookEventLog[]>([])
  const [streamState, setStreamState] = useState<WebhookEventStreamState>('connecting')
  const [error, setError] = useState<Error | null>(null)

  const eventsRef = useRef<WebhookEventLog[]>([])

  useEffect(() => {
    if (!enabled || !address || !token) {
      setEvents([])
      setStreamState('connecting')
      setError(null)
      return
    }

    setError(null)
    setStreamState('connecting')
    setEvents([])
    eventsRef.current = []

    const api = getApi(address, token)

    const unsubscribe = api.subscribeWebhookEvents({
      onEvent: (event) => {
        eventsRef.current = [event, ...eventsRef.current]
        setEvents(eventsRef.current)
      },
      onStateChange: (state) => {
        setStreamState(state)
        if (state === 'error') {
          const err = new Error('Event stream connection failed')
          setError(err)
        }
      },
    })

    return () => {
      unsubscribe()
    }
  }, [address, token, enabled])

  return {
    events,
    streamState,
    error,
    isLive: streamState === 'connected',
  }
}
