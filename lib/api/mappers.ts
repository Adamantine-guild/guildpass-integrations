import type {
  Community,
  Membership,
  MemberProfile,
  MemberRow,
  Resource,
  AccessPolicy,
  Session,
  WebhookEventLog,
  BackendMember,
  BackendSession,
  WalletVerification,
} from './types'
import { isApiError } from './errors'

export interface VerificationDisplay {
  status: 'verified' | 'unverified' | 'unavailable' | 'failed'
  title: string
  message: string
  badgeVariant: 'success' | 'warning' | 'destructive' | 'default'
}

// ── Community ────────────────────────────────────────────────────────────────

export function mapCommunity(raw: BackendSession['community']): Community {
  if (!raw) {
    return {
      id: 'unknown',
      name: 'Unknown Community',
      description: '',
      tiers: ['free'],
    }
  }

  return {
    id: raw.id ?? '',
    name: raw.name ?? '',
    description: raw.description,
    tiers: raw.tiers ?? ['free', 'standard', 'pro'],
  }
}

// ── Membership ───────────────────────────────────────────────────────────────

export function mapMembership(raw: BackendMember): Membership {
  return {
    address: raw.address ?? raw.wallet_address ?? '',
    tier: raw.tier ?? raw.membership_tier ?? 'free',
    active: raw.active ?? raw.is_active ?? false,
    expiresAt: raw.expiresAt ?? raw.expires_at,
  }
}

// ── Member Profile ───────────────────────────────────────────────────────────

export function mapMemberProfile(raw: any, address: string): MemberProfile {
  return {
    address,
    displayName:
      raw.displayName ?? raw.display_name ?? raw.username ?? 'Unknown',
    bio: raw.bio,
    badges: raw.badges ?? [],
  }
}

// ── Member Row (list view) ───────────────────────────────────────────────────

export function mapMemberRow(raw: any): MemberRow {
  return {
    address: raw.address ?? raw.wallet_address ?? '',
    roles: raw.roles ?? [],
    tier: raw.tier ?? raw.membership_tier ?? 'free',
    active: raw.active ?? raw.is_active ?? false,
  }
}

// ── Resource ─────────────────────────────────────────────────────────────────

export function mapResource(raw: any): Resource {
  return {
    id: raw.id ?? '',
    title: raw.title ?? raw.name ?? 'Untitled',
    description: raw.description,
    minTier: raw.minTier ?? raw.min_tier,
    roles: raw.roles ?? [],
  }
}

// ── Access Policy ────────────────────────────────────────────────────────────

export function mapPolicy(raw: any): AccessPolicy {
  return {
    resourceId: raw.resourceId ?? raw.resource_id ?? '',
    minTier: raw.minTier ?? raw.min_tier ?? 'free',
    roles: raw.roles ?? [],
  }
}

// ── Session ──────────────────────────────────────────────────────────────────

export function mapSession(raw: any): Session {
  return {
    address: raw.address ?? raw.wallet_address ?? '',
    roles: raw.roles ?? [],
    membership: raw.membership
      ? mapMembership(raw.membership as BackendMember)
      : undefined,
    community: raw.community ? mapCommunity(raw.community) : undefined,
  }
}

// ── Webhook Event ────────────────────────────────────────────────────────────

export function mapWebhookEvent(raw: any): WebhookEventLog {
  return {
    id: raw.id ?? '',
    eventType: raw.eventType ?? raw.event_type ?? 'membership.created',
    status: raw.status ?? 'pending',
    timestamp: raw.timestamp ?? raw.created_at ?? new Date().toISOString(),
    affectedIdentifier:
      raw.affectedIdentifier ?? raw.affected_identifier ?? '',
    payloadSummary: {
      network:
        raw.payloadSummary?.network ?? raw.payload_summary?.network,
      txHash:
        raw.payloadSummary?.txHash ?? raw.payload_summary?.tx_hash,
      tier: raw.payloadSummary?.tier ?? raw.payload_summary?.tier,
      reason:
        raw.payloadSummary?.reason ?? raw.payload_summary?.reason,
    },
  }
}

// ── Wallet Verification ──────────────────────────────────────────────────────

export function mapVerificationState(
  data: WalletVerification | undefined,
  error: unknown,
): VerificationDisplay {
  if (error) {
    const isUnavailable =
      isApiError(error) &&
      (error.status === 503 || error.code === 'network_error')

    if (isUnavailable) {
      return {
        status: 'unavailable',
        title: 'Verification Unavailable',
        message: isApiError(error)
          ? error.safeMessage
          : 'The verification service is currently unavailable.',
        badgeVariant: 'default',
      }
    }

    return {
      status: 'failed',
      title: 'Verification Check Failed',
      message: isApiError(error)
        ? error.safeMessage
        : 'An error occurred while checking verification.',
      badgeVariant: 'destructive',
    }
  }

  if (data?.verified) {
    return {
      status: 'verified',
      title: 'Verified',
      message: 'This wallet has been successfully verified.',
      badgeVariant: 'success',
    }
  }

  return {
    status: 'unverified',
    title: 'Not Verified',
    message: 'This wallet is not yet verified.',
    badgeVariant: 'warning',
  }
}