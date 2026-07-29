'use client'

/**
 * components/dashboard/wallet-sections.tsx
 *
 * Client-side wallet-dependent dashboard sections.
 * These hydrate client-side after the SSR shell (community, resources)
 * has streamed in. Wrapped in Suspense boundaries in the parent page.
 */

import { useAccount } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import {
  getApi,
  type MemberProfile,
  type Membership,
  type Session,
  type WalletVerification,
} from '@/lib/api'
import { queryKeys } from '@/lib/query'
import { Badge } from '@/components/ui/badge'
import {
  LoadingState,
  ErrorState,
  EmptyState,
  DeniedState,
  safeErrorMessage,
} from '@/components/ui/api-states'
import { AddressText } from '@/components/wallet/address-text'

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {children}
    </div>
  )
}

/**
 * Reads the wallet address and environment, then renders the four
 * wallet-dependent dashboard cards: community membership status,
 * profile / verification, badges, and gated resources.
 */
export default function WalletDashboardSections() {
  const { address, isConnected } = useAccount()

  const {
    data: session,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Session>({
    queryKey: queryKeys.session.byAddress(address ?? ''),
    queryFn: () => getApi(address).getSession(),
    enabled: !!address,
    retry: 1,
  })

  const {
    data: verification,
    isLoading: isVerifying,
    isError: verifyIsError,
    error: verifyError,
    refetch: refetchVerification,
  } = useQuery<WalletVerification>({
    queryKey: queryKeys.walletVerification.byAddress(address ?? ''),
    queryFn: () => getApi(address).verifyWallet(address as string),
    enabled: !!address,
    retry: 1,
  })

  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileIsError,
    error: profileError,
    refetch: refetchProfile,
  } = useQuery<MemberProfile | null>({
    queryKey: queryKeys.profile.byAddress(address ?? ''),
    queryFn: () => getApi(address).getProfile(address as string),
    enabled: !!address,
    retry: 1,
  })

  const membership: Membership | undefined = session?.membership

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* ── Membership status (wallet-dependent) ────────────────────────── */}
      <Section title="Membership">
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
            <div className="text-lg font-medium">
              {session?.community?.name ?? 'Unknown'}
            </div>
            <div className="text-sm text-muted-foreground">
              Tier:{' '}
              <Badge className="ml-1" variant="outline">
                {membership?.tier ?? '—'}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              Status:{' '}
              {membership?.active ? (
                <Badge variant="success">Active</Badge>
              ) : (
                <Badge variant="destructive">Inactive</Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              Expires:{' '}
              {membership?.expiresAt
                ? new Date(membership.expiresAt).toLocaleDateString()
                : 'N/A'}
            </div>
          </div>
        )}
      </Section>

      {/* ── Profile & Verification (wallet-dependent) ──────────────────── */}
      <Section title="Profile & Verification">
        {!address ? (
          <DeniedState
            title="Wallet connection required"
            message="Connect your wallet to load your profile and verification state."
          />
        ) : isVerifying ? (
          <LoadingState />
        ) : (
          <div className="space-y-4">
            {(() => {
              const display = mapVerificationState(verification, verifyError)
              return (
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    Verification:{' '}
                    <Badge variant={display.badgeVariant}>
                      {display.title}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {display.message}
                  </div>
                  {display.status === 'failed' && (
                    <button
                      onClick={() => refetchVerification()}
                      className="text-xs text-primary underline underline-offset-4"
                    >
                      Try again
                    </button>
                  )}
                </div>
              )
            })()}
            {verification && (
              <div className="space-y-2 pt-2 border-t">
                {verification.method ? (
                  <div className="text-sm text-muted-foreground">
                    Method: {verification.method}
                  </div>
                ) : null}
                <div className="text-sm text-muted-foreground">
                  Checked:{' '}
                  {new Date(verification.checkedAt).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ── Badges (wallet-dependent) ──────────────────────────────────── */}
      <Section title="Badges">
        {!address ? (
          <DeniedState
            title="Wallet connection required"
            message="Connect your wallet to view your badges."
          />
        ) : profileLoading ? (
          <LoadingState />
        ) : profileIsError ? (
          <ErrorState
            title="Failed to load badges"
            message={safeErrorMessage(profileError)}
            onRetry={() => refetchProfile()}
          />
        ) : profile && profile.badges.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {profile.badges.map((badge) => (
              <Badge key={badge}>{badge}</Badge>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No badges yet"
            message="Complete community milestones to earn badges."
          />
        )}
      </Section>

      {/* ── Address (wallet-dependent summary) ─────────────────────────── */}
      <Section title="Wallet">
        {isConnected && address ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Connected as</p>
            <AddressText
              address={address}
              className="text-sm font-muted"
            />
          </div>
        ) : (
          <DeniedState
            title="Wallet not connected"
            message="Connect your wallet to access member features."
          />
        )}
      </Section>
    </div>
  )
}

// ── Verification state mapper (copied from old dashboard page) ──────────────

interface VerificationDisplay {
  title: string
  message: string
  badgeVariant: 'outline' | 'success' | 'destructive'
  status: 'idle' | 'verified' | 'failed'
}

function mapVerificationState(
  verification: WalletVerification | undefined,
  error: Error | null,
): VerificationDisplay {
  if (error) {
    return {
      title: 'Verification failed',
      message: safeErrorMessage(error),
      badgeVariant: 'destructive',
      status: 'failed',
    }
  }
  if (!verification) {
    return {
      title: 'Pending',
      message: 'Verification status is being checked…',
      badgeVariant: 'outline',
      status: 'idle',
    }
  }
  if (verification.verified) {
    return {
      title: 'Verified',
      message: 'Your wallet has been verified.',
      badgeVariant: 'success',
      status: 'verified',
    }
  }
  return {
    title: 'Unverified',
    message: 'Your wallet has not been verified yet.',
    badgeVariant: 'destructive',
    status: 'failed',
  }
}
