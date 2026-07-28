import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Placeholder shown while a gated resource's content is being fetched.
 * Mirrors the loaded page's Card/title/description/content-block layout so
 * there is no layout shift when the real content resolves.
 */
export function ResourcePageSkeleton() {
  return (
    <Card role="status" aria-busy="true" aria-live="polite" className="min-h-[280px]">
      <span className="sr-only">Loading resource…</span>
      <CardHeader>
        <Skeleton className="h-7 w-2/3 max-w-80" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-4 w-1/3" />
        <div className="space-y-3 pt-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-24 w-full rounded-md" />
        </div>
      </CardContent>
    </Card>
  )
}
