export const MEMBERSHIP_EXPIRY_SOON_THRESHOLD_DAYS = 7
export const MEMBERSHIP_EXPIRY_SOON_THRESHOLD_MS =
  MEMBERSHIP_EXPIRY_SOON_THRESHOLD_DAYS * 24 * 60 * 60 * 1000

export const MEMBERSHIP_EXPIRY_STATUS_LABELS = {
  active: 'Active',
  expiringSoon: 'Expiring soon',
  expired: 'Expired',
} as const

export type MembershipExpiryStatus = keyof typeof MEMBERSHIP_EXPIRY_STATUS_LABELS

export const MEMBERSHIP_EXPIRY_BADGE_VARIANTS = {
  active: 'membershipActive',
  expiringSoon: 'membershipExpiring',
  expired: 'membershipExpired',
} as const satisfies Record<MembershipExpiryStatus, string>

export function getMembershipExpiryStatus(
  expiresAt: string | number | Date,
  now: string | number | Date = Date.now(),
): MembershipExpiryStatus {
  const expiresAtMs = new Date(expiresAt).getTime()
  const nowMs = new Date(now).getTime()

  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
    return 'expired'
  }

  if (expiresAtMs - nowMs <= MEMBERSHIP_EXPIRY_SOON_THRESHOLD_MS) {
    return 'expiringSoon'
  }

  return 'active'
}
