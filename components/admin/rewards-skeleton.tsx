import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Skeleton placeholder for the Rewards admin page.
 *
 * Mirrors the layout of the loaded page — page header, deferred-features
 * notice, member count header, and a list of member reward cards.
 */
export function RewardsSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="space-y-6 p-4 sm:p-6"
    >
      <span className="sr-only">Loading rewards</span>

      {/* Page header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <Skeleton className="h-4 w-3/4 max-w-lg" />
      </div>

      <Skeleton className="h-px w-full" />

      {/* Deferred features notice */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-900/30 dark:bg-amber-900/10">
        <Skeleton className="mb-2 h-4 w-48" />
        <div className="space-y-1">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-3 w-64" />
          ))}
        </div>
      </div>

      {/* Member count header */}
      <Skeleton className="h-6 w-36" />

      {/* Member reward cards */}
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} aria-hidden="true">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-2">
                  <div className="flex items-baseline gap-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-3 w-52" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Roles section */}
                <div>
                  <Skeleton className="mb-2 h-3 w-10" />
                  <div className="flex flex-wrap gap-2">
                    {[0, 1, 2].map((j) => (
                      <Skeleton key={j} className="h-5 w-16 rounded-full" />
                    ))}
                  </div>
                </div>

                <Skeleton className="h-px w-full" />

                {/* Deferred sections */}
                <div className="space-y-1.5">
                  {[0, 1, 2, 3].map((k) => (
                    <div key={k} className="flex items-center gap-2">
                      <Skeleton className="h-1.5 w-1.5 rounded-full" />
                      <Skeleton className="h-3 w-64" />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Implementation notes */}
      <div className="mt-8 rounded-lg border border-border bg-muted/30 p-4">
        <Skeleton className="mb-2 h-3 w-36" />
        <div className="space-y-1">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-3 w-72" />
          ))}
        </div>
      </div>
    </div>
  );
}