/**
 * components/dashboard/community-section.tsx
 *
 * Server Component that fetches and renders community information.
 * Streamed via Suspense — the page shell renders immediately while
 * this data loads server-side.
 */

import { fetchCommunity } from '@/lib/api/fetch-server'
import { CommunityCardSkeleton } from './skeletons'

// Re-export the skeleton so the parent can use it as a Suspense fallback
export { CommunityCardSkeleton }

export default async function CommunitySection() {
  let community
  try {
    community = await fetchCommunity()
  } catch {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
        <p className="text-sm font-medium text-destructive">Could not load community</p>
        <p className="text-xs text-muted-foreground">
          Community information is temporarily unavailable.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">Community</h3>
      <p className="text-lg font-semibold">{community.name}</p>
      {community.description && (
        <p className="text-sm text-muted-foreground">{community.description}</p>
      )}
      <div className="text-xs text-muted-foreground pt-1">
        Tiers: {community.tiers.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(', ')}
      </div>
    </div>
  )
}
