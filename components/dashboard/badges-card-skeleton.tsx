import { Skeleton } from '@/components/ui/skeleton'

export function BadgesCardSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex flex-wrap gap-2"
    >
      <span className="sr-only">Loading badges</span>
      <Skeleton className="h-6 w-20 rounded-full" />
      <Skeleton className="h-6 w-24 rounded-full" />
      <Skeleton className="h-6 w-16 rounded-full" />
      <Skeleton className="h-6 w-28 rounded-full" />
    </div>
  )
}