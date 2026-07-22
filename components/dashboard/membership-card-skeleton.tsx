import { Skeleton } from '../ui/skeleton'

export function MembershipCardSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="min-h-[116px] space-y-2"
    >
      <span className="sr-only">Loading membership details</span>
      <Skeleton className="h-7 w-2/3 max-w-64" />
      <div className="flex h-5 items-center gap-2">
        <Skeleton className="h-4 w-9" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="flex h-5 items-center gap-2">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="flex h-5 items-center gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
    </div>
  )
}
