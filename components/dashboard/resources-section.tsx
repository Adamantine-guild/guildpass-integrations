/**
 * components/dashboard/resources-section.tsx
 *
 * Server Component that fetches and renders the public resource listing.
 * Streamed via Suspense — the page shell renders immediately while
 * this data loads server-side.
 *
 * Note: Access gating (which resources the user can actually view) is
 * still determined client-side based on the connected wallet's membership.
 * This component renders the full list; the gating logic runs in the
 * client-side WalletDashboardSections component.
 */

import { fetchResources } from '@/lib/api/fetch-server'
import { ResourcesCardSkeleton } from './skeletons'

// Re-export the skeleton so the parent can use it as a Suspense fallback
export { ResourcesCardSkeleton }

export default async function ResourcesSection() {
  let resources
  try {
    resources = await fetchResources()
  } catch {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
        <p className="text-sm font-medium text-destructive">Could not load resources</p>
        <p className="text-xs text-muted-foreground">
          Resource listing is temporarily unavailable.
        </p>
      </div>
    )
  }

  if (!resources || resources.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Gated Resources</h3>
        <p className="text-sm text-muted-foreground">
          No resources have been configured for this community yet.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">
        Gated Resources ({resources.length})
      </h3>
      <p className="text-xs text-muted-foreground">
        Resources are available based on your membership tier. Connect your
        wallet to see which ones you can access.
      </p>
      <ul className="space-y-1">
        {resources.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
            <span>{r.title}</span>
            {r.minTier && (
              <span className="text-xs text-muted-foreground ml-auto">
                {r.minTier.charAt(0).toUpperCase() + r.minTier.slice(1)}+
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
