"use client"
import { ReactNode } from "react"
import { Button } from "./button"
import { ApiError } from "@/lib/api/errors"
import { cn } from "@/lib/utils"

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

function StateShell({
  tone,
  title,
  message,
  actions,
  role,
  ariaLive = "polite",
  ariaBusy,
  className
}: {
  tone: "loading" | "empty" | "error" | "denied"
  title?: string
  message: string
  actions?: ReactNode
  role?: "status" | "alert" | "note"
  ariaLive?: "polite" | "assertive"
  ariaBusy?: boolean
  className?: string
}) {
  const toneClass = {
    loading: "border-border bg-muted/30",
    empty: "border-dashed border-border bg-muted/20",
    error: "border-destructive/30 bg-destructive/5",
    denied: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-100"
  }[tone]

  return (
    <div
      role={role}
      aria-live={ariaLive}
      aria-busy={ariaBusy}
      className={cn("rounded-md border p-4 space-y-2", toneClass, className)}
    >
      {title && (
        <div
          className={cn(
            "text-sm font-medium",
            tone === "error" && "text-destructive",
            tone === "denied" && "text-amber-900 dark:text-amber-100"
          )}
        >
          {title}
        </div>
      )}
      <div
        className={cn(
          "text-sm text-muted-foreground",
          tone === "denied" && "text-amber-800 dark:text-amber-200"
        )}
      >
        {message}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 pt-1">{actions}</div>}
    </div>
  )
}

export function LoadingState({ message = "Loading…" }: { message?: string }) {
  return (
    <StateShell
      tone="loading"
      message={message}
      role="status"
      ariaLive="polite"
      ariaBusy
    />
  )
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
    <StateShell
      tone="error"
      title={title}
      message={message ?? "Please try again."}
      role="alert"
      ariaLive="assertive"
      actions={onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    />
  )
}

export function EmptyState({
  title = "Nothing here yet",
  message = "There is no data to show right now.",
  actions
}: {
  title?: string
  message?: string
  actions?: ReactNode
}) {
  return (
    <StateShell
      tone="empty"
      title={title}
      message={message}
      role="status"
      actions={actions}
    />
  )
}

export function DeniedState({
  title = "Access denied",
  message,
  actions
}: {
  title?: string
  message: string
  actions?: ReactNode
}) {
  return (
    <StateShell
      tone="denied"
      title={title}
      message={message}
      role="note"
      actions={actions}
    />
  )
}
