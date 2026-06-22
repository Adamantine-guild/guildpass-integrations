'use client'
import { useAccount } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { getApi, type Membership, type Session } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { LoadingState, ErrorState, EmptyState, DeniedState, safeErrorMessage } from '@/components/ui/api-states'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { address, isConnected } = useAccount()
  const { data: session, isLoading, isError, error, refetch } = useQuery<Session>({
    queryKey: ["session", address],
    queryFn: () => getApi(address).getSession(),
    enabled: !!address,
    retry: 1
  })

  const membership: Membership | undefined = session?.membership

  return (
    <div className="grid gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Member Dashboard</h1>
          <p className="text-sm text-muted-foreground">Wallet-aware member experience</p>
        </div>
        <div className="text-right">
          <div className="text-sm">
            {isConnected ? (
              <span className="text-muted-foreground">{address}</span>
            ) : (
              <span className="text-muted-foreground">Wallet not connected</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Section title="Community">
          {!address ? (
            <DeniedState
              title="Wallet connection required"
              message="Connect your wallet to load your community membership."
            />
          ) : isLoading ? (
            <LoadingState />
          ) : isError ? (
            <ErrorState
              title="Failed to load session"
              message={safeErrorMessage(error)}
              onRetry={() => refetch()}
            />
          ) : (
            <div className="space-y-2">
              <div className="text-lg font-medium">{session?.community?.name ?? "Unknown"}</div>
              <div className="text-sm text-muted-foreground">
                Tier: <Badge className="ml-1" variant="outline">{membership?.tier ?? "—"}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Status: {membership?.active ? <Badge variant="success">Active</Badge> : <Badge variant="destructive">Inactive</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">
                Expires: {membership?.expiresAt ? new Date(membership.expiresAt).toLocaleDateString() : "N/A"}
              </div>
            </div>
          )}
        </Section>

        <Section title="Profile Summary">
          <EmptyState
            title="Profile details unavailable"
            message="Basic profile details will appear here when they are available."
          />
        </Section>

        <Section title="Badges">
          <div className="flex flex-wrap gap-2">
            <Badge>Early Member</Badge>
            <Badge variant="outline">Placeholder</Badge>
          </div>
        </Section>

        <Section title="Gated Resources">
          <div className="space-y-2">
            <div className="text-sm">Explore resources based on your tier.</div>
            <div className="flex items-center gap-2">
              <Link href="/resources/alpha" className={buttonVariants()}>Alpha Docs</Link>
              <Link href="/events/demo" className={buttonVariants({ variant: 'outline' })}>Demo Event</Link>
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}
