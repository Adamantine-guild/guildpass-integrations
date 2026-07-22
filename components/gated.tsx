'use client'
import { ReactNode, useMemo } from 'react'
import { useAccount } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { getApi, type AccessRule, type MembershipTier, type Role } from '@/lib/api'
import { isApiError } from '@/lib/api/errors'
import { computeAccessDecision } from '@/lib/api/access-decision'
import {
  accessKeys,
  queryKeys,
  ACCESS_DECISION_STALE_TIME,
  ACCESS_DECISION_GC_TIME,
} from '@/lib/query'
import Link from 'next/link'
import { Button, buttonVariants } from './ui/button'
import { DisabledTooltip } from './ui/tooltip'
import { LoadingState, ErrorState, DeniedState, safeErrorMessage } from './ui/api-states'

export function Gated({
  children,
  minTier,
  roles,
  rule,
  resourceId
}: {
  children: ReactNode
  minTier?: MembershipTier
  roles?: Role[]
  /** Composable AND/OR rule tree; takes precedence over minTier/roles. */
  rule?: AccessRule
  resourceId?: string
}) {
  const { address, chain } = useAccount()
  const env = String(chain?.id ?? 1)
  const hasExplicitRequirements = minTier !== undefined || roles !== undefined || rule !== undefined

  const { data: session, isLoading: sessionLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.session.byAddress(address ?? ''),
    queryFn: ({ signal }) => getApi(address).getSession(signal),
    enabled: !!address,
    retry: (failureCount, err) => {
      if (isApiError(err) && err.code === 'aborted') return false
      return failureCount < 1
    },
  })

  const { data: policies, isLoading: policiesLoading } = useQuery({
    queryKey: queryKeys.policies.all,
    queryFn: ({ signal }) => getApi(address).listPolicies(signal),
    enabled: !!address && !hasExplicitRequirements && !!resourceId,
    retry: (failureCount, err) => {
      if (isApiError(err) && err.code === 'aborted') return false
      return failureCount < 1
    },
  })

  const { data: resources, isLoading: resourcesLoading } = useQuery({
    queryKey: queryKeys.resources.all,
    queryFn: ({ signal }) => getApi(address).listResources(signal),
    enabled: !!address && !hasExplicitRequirements && !!resourceId,
    retry: (failureCount, err) => {
      if (isApiError(err) && err.code === 'aborted') return false
      return failureCount < 1
    },
  })

  const dynamicPolicy = useMemo(() => {
    if (!policies || !resourceId) return undefined
    return policies.find((p) => p.resourceId === resourceId)
  }, [policies, resourceId])

  const dynamicResource = useMemo(() => {
    if (!resources || !resourceId) return undefined
    return resources.find((r) => r.id === resourceId)
  }, [resources, resourceId])

  const effectiveMinTier = minTier !== undefined
    ? minTier
    : (dynamicPolicy?.minTier !== undefined ? dynamicPolicy.minTier : dynamicResource?.minTier)

  const effectiveRoles = roles !== undefined
    ? roles
    : (dynamicPolicy?.roles !== undefined ? dynamicPolicy.roles : dynamicResource?.roles)

  // A composable rule (from props or the resource's policy) supersedes the
  // legacy single-condition minTier/roles requirements.
  const effectiveRule = hasExplicitRequirements ? rule : dynamicPolicy?.rule

  const requirements = effectiveRule
    ? { rule: effectiveRule }
    : { minTier: effectiveMinTier, roles: effectiveRoles }

  const requirementsLoaded =
    hasExplicitRequirements ||
    !resourceId ||
    (policies !== undefined && resources !== undefined)

  const { data: cachedDecision, isLoading: decisionLoading } = useQuery({
    queryKey: accessKeys.decision(env, address ?? '', resourceId ?? ''),
    queryFn: () => computeAccessDecision(session!, requirements),
    enabled: !!session && !!resourceId && requirementsLoaded,
    staleTime: ACCESS_DECISION_STALE_TIME,
    gcTime: ACCESS_DECISION_GC_TIME,
    retry: 1,
  })

  const fallbackDecision = useMemo(
    () => session ? computeAccessDecision(session, { minTier: effectiveMinTier, roles: effectiveRoles, rule: effectiveRule }) : undefined,
    [session, effectiveMinTier, effectiveRoles, effectiveRule]
  )

  const decision = resourceId ? cachedDecision : fallbackDecision
  const isRequirementsLoading = !!resourceId && !hasExplicitRequirements && (policiesLoading || resourcesLoading)
  const isLoading = resourceId ? (sessionLoading || decisionLoading || isRequirementsLoading) : sessionLoading

  if (!address) {
    return <AccessDenied reason="Please connect your wallet to continue." />
  }

  if (isLoading) {
    return <LoadingState message="Checking access…" />
  }

  if (isError && !(isApiError(error) && error.code === 'aborted')) {
    return (
      <ErrorState
        title="Could not verify access"
        message={safeErrorMessage(error)}
        onRetry={() => refetch()}
      />
    )
  }

  if (!decision?.allowed) {
    return <AccessDenied reason={decision?.reason ?? 'Your current membership does not grant access.'} />
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
          <DisabledTooltip content="Coming soon">
            <Button
              variant="outline"
              disabled
              aria-disabled="true"
              className="cursor-not-allowed opacity-60"
            >
              Upgrade or Renew
            </Button>
          </DisabledTooltip>
        </>
      }
    />
  )
}