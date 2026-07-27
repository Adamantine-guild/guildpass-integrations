import { Skeleton } from '@/components/ui/skeleton'

export function ResourcesCardSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="space-y-2"
    >
      <span className="sr-only">Loading resources</span>
      <Skeleton className="h-4 w-48" />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="h-9 w-20 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
    </div>
  )
}