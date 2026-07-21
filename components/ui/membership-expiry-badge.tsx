import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  MEMBERSHIP_EXPIRY_BADGE_VARIANTS,
  MEMBERSHIP_EXPIRY_STATUS_LABELS,
  getMembershipExpiryStatus,
  type MembershipExpiryStatus,
} from '@/lib/membership-expiry'

const membershipExpiryBadgeConfig: Record<
  MembershipExpiryStatus,
  {
    icon: typeof CheckCircle2
    variant: (typeof MEMBERSHIP_EXPIRY_BADGE_VARIANTS)[MembershipExpiryStatus]
  }
> = {
  active: {
    icon: CheckCircle2,
    variant: MEMBERSHIP_EXPIRY_BADGE_VARIANTS.active,
  },
  expiringSoon: {
    icon: AlertTriangle,
    variant: MEMBERSHIP_EXPIRY_BADGE_VARIANTS.expiringSoon,
  },
  expired: {
    icon: XCircle,
    variant: MEMBERSHIP_EXPIRY_BADGE_VARIANTS.expired,
  },
}

export interface MembershipExpiryBadgeProps {
  expiresAt: string | number | Date
}

export function MembershipExpiryBadge({ expiresAt }: MembershipExpiryBadgeProps) {
  const status = getMembershipExpiryStatus(expiresAt)
  const config = membershipExpiryBadgeConfig[status]
  const Icon = config.icon

  return (
    <Badge
      variant={config.variant}
      className="gap-1"
      aria-label={`Membership ${MEMBERSHIP_EXPIRY_STATUS_LABELS[status]}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {MEMBERSHIP_EXPIRY_STATUS_LABELS[status]}
    </Badge>
  )
}
