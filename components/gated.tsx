'use client'
import { ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { getApi, type MembershipTier, type Role } from '@/lib/api'
import Link from 'next/link'
import { buttonVariants } from './ui/button'
import { LoadingState, ErrorState, DeniedState, safeErrorMessage } from './ui/api-states'

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
  const { data: session, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['session', address],
    queryFn: () => getApi(address).getSession(),
    enabled: !!address,
    retry: 1
  })

  if (!address) {
    return <AccessDenied reason="Please connect your wallet to continue." />
  }

  if (isLoading) {
    return <LoadingState message="Checking access…" />
  }

  if (isError) {
    return (
      <ErrorState
        title="Could not verify access"
        message={safeErrorMessage(error)}
        onRetry={() => refetch()}
      />
    )
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
    <DeniedState
      title="Access denied"
      message={reason}
      actions={
        <>
        <Link href="/dashboard" className={buttonVariants()}>Back to Dashboard</Link>
        <Link href="/dashboard" className={buttonVariants({ variant: 'outline' })}>Upgrade or Renew</Link>
        </>
      }
    />
  )
}
