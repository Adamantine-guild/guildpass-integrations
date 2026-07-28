"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface DisabledTooltipProps extends React.HTMLAttributes<HTMLDivElement> {
  content: string
  children: React.ReactNode
}

export function DisabledTooltip({
  content,
  children,
  className,
  ...props
}: DisabledTooltipProps) {
  return (
    <div className={cn("relative inline-block group", className)} {...props}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block group-focus-within:block px-2.5 py-1 text-xs text-popover-foreground bg-popover border border-border rounded shadow-md whitespace-nowrap z-50 transition-opacity"
      >
        {content}
      </span>
    </div>
  )
}