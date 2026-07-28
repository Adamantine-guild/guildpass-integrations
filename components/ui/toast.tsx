"use client"

import { useCallback, useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export type ToastTone = "success" | "error" | "warning"

export type ToastMessage = {
  id: string
  title: string
  description?: string
  tone?: ToastTone
}

const toneClasses: Record<ToastTone, string> = {
  success: "border-green-600/40 bg-green-50 text-green-950 dark:border-green-500/40 dark:bg-green-950/40 dark:text-green-50",
  error: "border-destructive/40 bg-destructive/10 text-destructive dark:bg-destructive/20",
  warning: "border-amber-400/60 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-50",
}

const DEFAULT_DISMISS_MS = 5000

export function useToasts(autoDismissMs = DEFAULT_DISMISS_MS) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const addToast = useCallback((toast: Omit<ToastMessage, "id">) => {
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
    setToasts((current) => [...current, { ...toast, id }])
    return id
  }, [])

  useEffect(() => {
    if (!toasts.length) return

    const timers = toasts.map((toast) =>
      window.setTimeout(() => dismissToast(toast.id), autoDismissMs),
    )

    return () => {
      timers.forEach(window.clearTimeout)
    }
  }, [autoDismissMs, dismissToast, toasts])

  return { toasts, addToast, dismissToast }
}

export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[]
  onDismiss: (id: string) => void
}) {
  if (!toasts.length) return null

  return (
    <div
      className="fixed right-4 top-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
      aria-live="polite"
      aria-relevant="additions text"
    >
      {toasts.map((toast) => {
        const tone = toast.tone ?? "success"
        return (
          <div
            key={toast.id}
            role={tone === "error" ? "alert" : "status"}
            className={cn(
              "relative rounded-md border p-4 pr-10 text-sm shadow-lg backdrop-blur",
              toneClasses[tone],
            )}
          >
            <div className="font-medium">{toast.title}</div>
            {toast.description && (
              <div className="mt-1 opacity-85">{toast.description}</div>
            )}
            <button
              type="button"
              className="absolute right-2 top-2 rounded-md px-2 py-1 text-lg leading-none opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
