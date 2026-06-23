"use client"
import { Button } from "./button"
import { ApiError } from "@/lib/api/errors"

export function safeErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.safeMessage
  if (err instanceof Error) {
    if (/fetch|network|connect/i.test(err.message)) {
      return "Unable to connect. Please check your connection and try again."
    }
    return "An unexpected error occurred."
  }
  return "An unexpected error occurred."
}

export function LoadingState({ message = "Loading…" }: { message?: string }) {
  return <div className="text-sm text-muted-foreground">{message}</div>
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry
}: {
  title?: string
  message?: string
  onRetry?: () => void
}) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 space-y-2">
      <div className="text-sm font-medium text-destructive">{title}</div>
      {message && (
        <div className="text-xs text-muted-foreground">{message}</div>
      )}
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ message = "Nothing here yet." }: { message?: string }) {
  return <div className="text-sm text-muted-foreground">{message}</div>
}
