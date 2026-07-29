import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Skeleton placeholder for the Analytics admin page.
 *
 * Mirrors the layout of the loaded page — summary stat cards in a row,
 * a membership growth chart, and a two-column grid of distribution bars.
 */
export function AnalyticsSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="space-y-6 p-4 sm:p-6"
    >
      <span className="sr-only">Loading analytics</span>

      {/* Page header */}
      <div className="flex flex-col gap-1">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>

      <Skeleton className="h-px w-full" />

      {/* Stat cards row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} aria-hidden="true">
            <CardHeader className="pb-1">
              <CardTitle>
                <Skeleton className="h-4 w-20" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Membership Growth Chart skeleton */}
      <Card aria-hidden="true">
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-5 w-52" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-[6px]">
            {[60, 80, 45, 70, 90, 55, 75, 65, 85, 50, 72, 62].map((h, i) => (
              <Skeleton
                key={i}
                className="w-4 rounded-t"
                style={{ height: `${h}px` }}
              />
            ))}
          </div>
          <Skeleton className="mt-3 h-3 w-40" />
        </CardContent>
      </Card>

      {/* Two-column distribution grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[0, 1].map((col) => (
          <Card key={col} aria-hidden="true">
            <CardHeader>
              <CardTitle>
                <Skeleton className="h-5 w-36" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[0, 1, 2].map((row) => (
                <div key={row} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Generated-at footer */}
      <div className="flex justify-end">
        <Skeleton className="h-3 w-36" />
      </div>
    </div>
  );
}