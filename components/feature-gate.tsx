import { ReactNode } from 'react'
import Link from 'next/link'
import { buttonVariants } from './ui/button'
import { DeniedState } from './ui/api-states'

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
  children,
}: {
  enabled: boolean
  name: string
  children: ReactNode
}) {
  if (!enabled) return <FeatureUnavailable name={name} />
  return <>{children}</>
}
