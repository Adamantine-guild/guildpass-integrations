import { ReactNode } from 'react'
import Link from 'next/link'
import { buttonVariants } from './ui/button'
import { DeniedState } from './ui/api-states'
import { isFeatureEnabled } from '@/lib/features'
import type { FeatureGateEnabled } from '@/lib/features'

export function FeatureUnavailable({ name }: { name: string }) {
  return (
    <DeniedState
      title={`${name} is not available`}
      message="This module is not enabled in the current environment."
      actions={
        <Link href="/dashboard" className={buttonVariants({ variant: 'outline' })}>
          Back to Dashboard
        </Link>
      }
    />
  )
}

export function FeatureGate({
  enabled,
  name,
  rolloutIdentifier,
  children,
}: {
  enabled: FeatureGateEnabled
  rolloutIdentifier?: string | null
  name: string
  children: ReactNode
}) {
  if (!isFeatureEnabled(enabled, rolloutIdentifier)) return <FeatureUnavailable name={name} />
  return <>{children}</>
}
