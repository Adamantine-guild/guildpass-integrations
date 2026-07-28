import { Suspense } from 'react'
import CommunitySection, {
  CommunityCardSkeleton,
} from '@/components/dashboard/community-section'
import ResourcesSection, {
  ResourcesCardSkeleton,
} from '@/components/dashboard/resources-section'
import WalletDashboardSections from '@/components/dashboard/wallet-sections'
import {
  ProfileCardSkeleton,
  BadgesCardSkeleton,
} from '@/components/dashboard/skeletons'

export default function DashboardPage() {
  return (
    <div className="grid gap-6">
      {/* ── Page header (static, streams immediately) ──────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Member Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Wallet-aware member experience
          </p>
        </div>
      </div>

      {/* ── SSR sections (streamed via Suspense) ───────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Community info — SSR, no wallet needed */}
        <Suspense fallback={<CommunityCardSkeleton />}>
          {/* @ts-expect-error — async Server Components are valid in Next.js 14 */}
          <CommunitySection />
        </Suspense>

        {/* Public resource listing — SSR, no wallet needed */}
        <Suspense fallback={<ResourcesCardSkeleton />}>
          {/* @ts-expect-error — async Server Components are valid in Next.js 14 */}
          <ResourcesSection />
        </Suspense>
      </div>

      {/* ── Wallet-dependent sections (hydrate client-side) ────────────── */}
      <Suspense
        fallback={
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ProfileCardSkeleton />
            <BadgesCardSkeleton />
          </div>
        }
      >
        <WalletDashboardSections />
      </Suspense>
    </div>
  )
}
