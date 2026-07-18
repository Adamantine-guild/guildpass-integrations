"use client"

import { ResourceContentBlock } from "@/lib/api/types"
import { ExternalLink, FileText, Video, AlertCircle, Info, AlertTriangle } from "lucide-react"
import { EmptyState } from "@/components/ui/api-states"

interface ResourceContentRendererProps {
  content?: ResourceContentBlock[]
}

export function ResourceContentRenderer({ content }: ResourceContentRendererProps) {
  if (!content || content.length === 0) {
    return (
      <EmptyState
        title="No content available"
        message="This resource doesn't have any content yet."
      />
    )
  }

  return (
    <div className="space-y-6 mt-6">
      {content.map((block, index) => (
        <ContentBlock key={index} block={block} />
      ))}
    </div>
  )
}

function ContentBlock({ block }: { block: ResourceContentBlock }) {
  switch (block.type) {
    case "text":
      return <p className="text-base leading-relaxed">{block.body}</p>

    case "markdown":
      return (
        <div className="prose prose-sm max-w-none dark:prose-invert">
          {/* Simple safe rendering: treat as preformatted text if no library is available */}
          <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed">
            {block.body}
          </pre>
        </div>
      )

    case "link":
      return (
        <a
          href={block.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 p-4 rounded-lg border bg-card hover:bg-accent transition-colors text-card-foreground"
        >
          <ExternalLink className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <div className="font-medium">{block.title || "External Link"}</div>
            {block.url && (
              <div className="text-xs text-muted-foreground truncate max-w-xs md:max-w-md">
                {block.url}
              </div>
            )}
          </div>
        </a>
      )

    case "video":
      return (
        <div className="space-y-2">
          {block.title && <h3 className="font-medium">{block.title}</h3>}
          <div className="flex items-center gap-2 p-4 rounded-lg border bg-card text-card-foreground">
            <Video className="h-5 w-5 text-muted-foreground" />
            <a
              href={block.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              Watch Video
            </a>
          </div>
        </div>
      )

    case "file":
      return (
        <div className="flex items-center gap-2 p-4 rounded-lg border bg-card text-card-foreground">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <div className="font-medium">{block.title || "Download File"}</div>
          </div>
          <a
            href={block.url}
            download
            className="text-sm font-medium text-primary hover:underline"
          >
            Download
          </a>
        </div>
      )

    case "callout":
      const { icon: Icon, colorClass } = getCalloutStyles(block.level)
      return (
        <div className={`flex gap-3 p-4 rounded-lg border ${colorClass}`}>
          <Icon className="h-5 w-5 shrink-0" />
          <div className="space-y-1">
            {block.title && <div className="font-bold text-sm uppercase tracking-wider">{block.title}</div>}
            <div className="text-sm">{block.body}</div>
          </div>
        </div>
      )

    default:
      return (
        <div className="p-4 rounded-lg border border-dashed bg-muted/50 text-muted-foreground text-sm italic">
          Unsupported content type: {block.type}
        </div>
      )
  }
}

function getCalloutStyles(level?: string) {
  switch (level) {
    case "info":
      return { icon: Info, colorClass: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300" }
    case "warning":
      return { icon: AlertTriangle, colorClass: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300" }
    case "error":
      return { icon: AlertCircle, colorClass: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300" }
    default:
      return { icon: Info, colorClass: "bg-muted border-border text-foreground" }
  }
}
