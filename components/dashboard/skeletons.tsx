/**
 * components/dashboard/skeletons.tsx
 *
 * Loading-placeholder components used as Suspense fallbacks during
 * SSR streaming of the member dashboard. Each skeleton mirrors the
 * layout of its corresponding data section.
 */

export function CommunityCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3 animate-pulse">
      <div className="h-4 w-24 bg-muted rounded" />
      <div className="h-6 w-40 bg-muted rounded" />
      <div className="space-y-2 pt-2">
        <div className="h-4 w-28 bg-muted rounded" />
        <div className="h-4 w-20 bg-muted rounded" />
        <div className="h-4 w-32 bg-muted rounded" />
      </div>
    </div>
  )
}

export function ResourcesCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3 animate-pulse">
      <div className="h-4 w-28 bg-muted rounded" />
      <div className="h-4 w-full bg-muted rounded" />
      <div className="flex flex-wrap gap-2 pt-1">
        <div className="h-8 w-20 bg-muted rounded-md" />
        <div className="h-8 w-24 bg-muted rounded-md" />
        <div className="h-8 w-16 bg-muted rounded-md" />
      </div>
    </div>
  )
}

export function ProfileCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3 animate-pulse">
      <div className="h-4 w-24 bg-muted rounded" />
      <div className="h-4 w-36 bg-muted rounded" />
      <div className="h-4 w-48 bg-muted rounded" />
    </div>
  )
}

export function BadgesCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3 animate-pulse">
      <div className="h-4 w-16 bg-muted rounded" />
      <div className="flex flex-wrap gap-2">
        <div className="h-6 w-16 bg-muted rounded-full" />
        <div className="h-6 w-20 bg-muted rounded-full" />
        <div className="h-6 w-14 bg-muted rounded-full" />
      </div>
    </div>
  )
}
