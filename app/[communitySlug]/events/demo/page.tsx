"use client"
import { Gated } from "@/components/gated"
import { FeatureGate } from "@/components/feature-gate"
import { EmptyState } from "@/components/ui/api-states"
import { features } from "@/lib/features"

export default function DemoEvent() {
  return (
    <FeatureGate enabled={features.events} name="Events">
      <Gated minTier="free" resourceId="events:demo">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Demo Event Access</h1>
          <p className="text-muted-foreground">Members can access this event page.</p>
          <EmptyState
            title="Ticket unavailable"
            message="Event ticket status will appear here when it is available."
          />
        </div>
      </Gated>
    </FeatureGate>
  )
}
