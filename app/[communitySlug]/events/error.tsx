'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  categorizeError,
  isApiError,
  type ErrorCategory,
} from '@/lib/api/errors'

interface EventsErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

const categoryMeta: Record<ErrorCategory, { title: string; message: string; retryable: boolean }> =
  {
    network: {
      title: 'Connection lost',
      message:
        'Unable to load event details. Please check your internet connection and try again.',
      retryable: true,
    },
    auth: {
      title: 'Access issue',
      message:
        'Your session could not be verified. Please reconnect your wallet to view events.',
      retryable: false,
    },
    validation: {
      title: 'Data error',
      message:
        'We received an unexpected response while loading this event. This may be a temporary issue.',
      retryable: true,
    },
    unknown: {
      title: 'Something went wrong',
      message:
        'An unexpected error occurred while loading this event. Please try again.',
      retryable: true,
    },
  }

export default function EventsErrorPage({ error, reset }: EventsErrorPageProps) {
  const category = categorizeError(error)
  const meta = categoryMeta[category]

  useEffect(() => {
    console.error('[Events Error]', {
      category,
      digest: error.digest,
      message: error.message,
      ...(isApiError(error) && { code: error.code, status: error.status }),
    })
  }, [error, category])

  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-md border border-destructive/30 bg-destructive/5 p-6">
      <h2 className="text-lg font-semibold text-destructive">{meta.title}</h2>
      <p className="text-sm text-muted-foreground">{meta.message}</p>

      {isApiError(error) && error.path && (
        <p className="text-xs text-muted-foreground/60">
          Endpoint: <code className="rounded bg-muted px-1 py-0.5">{error.path}</code>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {meta.retryable && (
          <Button size="sm" variant="outline" onClick={reset}>
            Try again
          </Button>
        )}

        {category === 'auth' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            Reconnect wallet
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          onClick={() => window.location.reload()}
        >
          Reload page
        </Button>
      </div>
    </div>
  )
}
