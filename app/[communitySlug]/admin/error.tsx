'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  categorizeError,
  isApiError,
  type ErrorCategory,
} from '@/lib/api/errors'

interface AdminErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

const categoryMeta: Record<ErrorCategory, { title: string; message: string; retryable: boolean }> =
  {
    network: {
      title: 'Network issue',
      message:
        'Could not reach the admin server. Please check your connection and try again.',
      retryable: true,
    },
    auth: {
      title: 'Admin session expired',
      message:
        'Your admin session has expired or you do not have permission. Please re-authenticate with your wallet.',
      retryable: false,
    },
    validation: {
      title: 'Invalid response',
      message:
        'The server returned an unexpected response. This may be a temporary issue.',
      retryable: true,
    },
    unknown: {
      title: 'Something went wrong',
      message: 'An unexpected error occurred in the admin area. Please try again.',
      retryable: true,
    },
  }

export default function AdminErrorPage({ error, reset }: AdminErrorPageProps) {
  const category = categorizeError(error)
  const meta = categoryMeta[category]

  useEffect(() => {
    console.error('[Admin Error]', {
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
            onClick={() => {
              window.location.href = `/${window.location.pathname.split('/')[1]}/admin`
            }}
          >
            Return to admin home
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
