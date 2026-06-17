'use client'
import { ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { getApi, type MembershipTier, type Role } from '@/lib/api'
import Link from 'next/link'
import { buttonVariants } from './ui/button'

export function Gated({
  children,
  minTier,
  roles
}: {
  children: ReactNode
  minTier?: MembershipTier
  roles?: Role[]
}) {
  const { address } = useAccount()
  const { data: session, isLoading } = useQuery({
    queryKey: ['session', address],
    queryFn: () => getApi(address).getSession(),
    enabled: !!address
  })

  if (!address) {
    return <AccessDenied reason="Please connect your wallet to continue." />
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Checking access…</div>
  }

  const hasRole = roles ? roles.some(r => session?.roles?.includes(r)) : true
  const tiers = ['free', 'standard', 'pro'] as MembershipTier[]
  const meetsTier = minTier
    ? tiers.indexOf(session?.membership?.tier as MembershipTier) >= tiers.indexOf(minTier)
    : true

  if (!hasRole || !meetsTier || !session?.membership?.active) {
    return <AccessDenied reason="Your current membership does not grant access." />
  }

  return <>{children}</>
}

export function AccessDenied({ reason }: { reason: string }) {
  return (
    <div className="rounded-md border p-6">
      <div className="text-lg font-medium mb-2">Access Denied</div>
      <div className="text-sm text-muted-foreground mb-4">{reason}</div>
      <div className="flex items-center gap-2">
        <Link href="/dashboard" className={buttonVariants()}>Back to Dashboard</Link>
        <Link href="/dashboard" className={buttonVariants({ variant: 'outline' })}>Upgrade or Renew</Link>
      </div>
    </div>
  )
}
