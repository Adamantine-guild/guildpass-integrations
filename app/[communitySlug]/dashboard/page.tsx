'use client'
import { useAccount } from 'wagmi'
import { useQuery, useQueryClient, useIsFetching } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import {
  getApi,
  type MemberProfile,
  type Membership,
  type Resource,
  type Session,
  type WalletVerification,
} from "@/lib/api";
import { isApiError } from "@/lib/api/errors";
import { mapVerificationState } from "@/lib/api/mappers";
import { queryKeys } from "@/lib/query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MembershipExpiryBadge } from "@/components/ui/membership-expiry-badge";
import { MembershipCardSkeleton } from "@/components/dashboard/membership-card-skeleton";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  LoadingState,
  ErrorState,
  EmptyState,
  DeniedState,
  safeErrorMessage,
} from "@/components/ui/api-states";
import { SyncStatusBanner } from "@/components/ui/sync-status-banner";
import { AddressText } from "@/components/wallet/address-text";
import { DisabledTooltip } from "@/components/ui/tooltip";
import { ProfileEditor } from "@/components/dashboard/profile-editor";
import { features } from "@/lib/features";

/**
 * Never retry aborted requests (cancelled by React Query on wallet switch or
 * component unmount). All other failures follow the default retry count.
 */
function retryUnlessAborted(failureCount: number, err: unknown): boolean {
  if (isApiError(err) && err.code === 'aborted') return false
  return failureCount < 1
}

/**
 * staleTime for dashboard queries.
 *
 * Using a non-zero staleTime serves two purposes:
 *   1. React Query won't re-fetch on every re-mount, reducing redundant requests.
 *   2. When the browser is offline, React Query will return cached data rather
 *      than immediately erroring, because the data is not yet considered stale.
 *      The service worker handles the actual HTTP-layer cache; this aligns the
 *      in-memory RQ cache TTL with that behaviour.
 *
 * 5 minutes matches a reasonable "last known good" window for membership data.
 */
const DASHBOARD_STALE_TIME = 5 * 60 * 1000

/**
 * gcTime for dashboard queries.
 *
 * Keep query data in memory for 30 minutes after the last observer unmounts
 * so navigating back to the dashboard within a session shows data immediately.
 */
const DASHBOARD_GC_TIME = 30 * 60 * 1000

function Section({
  title,
  titleAdornment,
  children,
}: {
  title: string;
  titleAdornment?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          {titleAdornment}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function PreviewBadge({ label = "Preview", tooltip }: { label?: string; tooltip: string }) {
  return (
    <DisabledTooltip content={tooltip}>
      <Badge
        variant="outline"
        className="cursor-default border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-100"
      >
        {label}
      </Badge>
    </DisabledTooltip>
  );
}

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const params = useParams();
  const communitySlug = (params?.communitySlug as string) || 'guildpass-demo';

  // Tracks whether *any* dashboard query is currently refetching in the
  // background.  Used to show a spinner on the manual refresh button and
  // to prevent duplicate concurrent fetches.
  const isRefreshing =
    useIsFetching({
      predicate(query) {
        const key = query.queryKey;
        return (
          (key[0] === 'session' ||
          key[0] === 'walletVerification' ||
          key[0] === 'profile' ||
          key[0] === 'resources') &&
          key[2] === communitySlug
        );
      },
    }) > 0;

  async function handleRefresh() {
    if (!address || isRefreshing) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.session.byAddress(address, communitySlug) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.walletVerification.byAddress(address, communitySlug) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.byAddress(address, communitySlug) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.resources.all(communitySlug) }),
    ]);
  }

  const {
    data: session,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Session>({
    queryKey: queryKeys.session.byAddress(address ?? "", communitySlug),
    queryFn: ({ signal }) => getApi(address, undefined, communitySlug).getSession(signal),
    enabled: !!address,
    retry: retryUnlessAborted,
    staleTime: DASHBOARD_STALE_TIME,
    gcTime: DASHBOARD_GC_TIME,
  });

  const {
    data: verification,
    isLoading: isVerifying,
    isError: verifyIsError,
    error: verifyError,
    refetch: refetchVerification,
  } = useQuery<WalletVerification>({
    queryKey: queryKeys.walletVerification.byAddress(address ?? "", communitySlug),
    queryFn: ({ signal }) => getApi(address, undefined, communitySlug).verifyWallet(address as string, signal),
    enabled: !!address,
    retry: retryUnlessAborted,
    staleTime: DASHBOARD_STALE_TIME,
    gcTime: DASHBOARD_GC_TIME,
  });

  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileIsError,
    error: profileError,
    refetch: refetchProfile,
  } = useQuery<MemberProfile | null>({
    queryKey: queryKeys.profile.byAddress(address ?? "", communitySlug),
    queryFn: ({ signal }) => getApi(address, undefined, communitySlug).getProfile(address as string, signal),
    enabled: !!address,
    retry: retryUnlessAborted,
    staleTime: DASHBOARD_STALE_TIME,
    gcTime: DASHBOARD_GC_TIME,
  });

  const {
    data: resources,
    isLoading: resourcesLoading,
    isError: resourcesIsError,
    error: resourcesError,
    refetch: refetchResources,
  } = useQuery<Resource[]>({
    queryKey: queryKeys.resources.all(communitySlug),
    queryFn: ({ signal }) => getApi(address, undefined, communitySlug).listResources(signal),
    enabled: !!address && features.resources,
    staleTime: DASHBOARD_STALE_TIME,
    gcTime: DASHBOARD_GC_TIME,
    retry: retryUnlessAborted,
  });

  const membership: Membership | undefined = session?.membership;

  function hasAccessToResource(resource: Resource): boolean {
    if (!membership) return false;
    if (!resource.minTier) return true;
    const tierOrder = ["free", "standard", "pro"];
    const userTierIndex = tierOrder.indexOf(membership.tier);
    const requiredTierIndex = tierOrder.indexOf(resource.minTier);
    return userTierIndex >= requiredTierIndex;
  }

  function getResourceHref(resource: Resource): string | null {
    if (features.resources) return `/${communitySlug}/resources/${resource.id}`;
    return null;
  }

  return (
    <div className="grid gap-6">
      {/* Offline / sync-status indicator — renders only when offline or syncing */}
      <SyncStatusBanner />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Member Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Wallet-aware member experience
          </p>
        </div>
        <div className="text-left sm:text-right">
          <div className="text-sm flex items-center gap-3 justify-end">
            {isConnected ? (
              <>
                <AddressText
                  address={address}
                  className="text-muted-foreground"
                />
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing || !isConnected}
                  aria-label="Refresh membership data"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  <svg
                    className={isRefreshing ? 'animate-spin' : ''}
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                  </svg>
                  {isRefreshing ? 'Refreshing…' : 'Refresh'}
                </button>
              </>
            ) : (
              <span className="text-muted-foreground">
                Wallet not connected
              </span>
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
            <MembershipCardSkeleton />
          ) : isError && !(isApiError(error) && error.code === 'aborted') ? (
            <ErrorState
              title="Failed to load session"
              message={safeErrorMessage(error)}
              onRetry={() => refetch()}
            />
          ) : (
            <div className="min-h-[116px] space-y-2">
              <div className="text-lg font-medium">
                {session?.community?.name ?? "Unknown"}
              </div>
              <div className="text-sm text-muted-foreground">
                Tier:{" "}
                <Badge className="ml-1" variant="outline">
                  {membership?.tier ?? "—"}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Status:{" "}
                {membership?.active ? (
                  <Badge variant="success">Active</Badge>
                ) : (
                  <Badge variant="destructive">Inactive</Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-2">
                <span>
                  Expires: {membership?.expiresAt
                    ? new Date(membership.expiresAt).toLocaleDateString()
                    : "N/A"}
                </span>
                {membership?.expiresAt ? (
                  <MembershipExpiryBadge expiresAt={membership.expiresAt} />
                ) : null}
              </div>
            </div>
          )}
        </Section>

        <Section title="Profile">
          {!address ? (
            <DeniedState
              title="Wallet connection required"
              message="Connect your wallet to view and edit your profile."
            />
          ) : (
            <ProfileEditor address={address} />
          )}
        </Section>

        <Section title="Wallet Verification">
          {!address ? (
            <DeniedState
              title="Wallet connection required"
              message="Connect your wallet to load your verification state."
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
                    Checked: {new Date(verification.checkedAt).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>

        <Section
          title="Badges"
          titleAdornment={
            <PreviewBadge tooltip="Badges are coming soon — full badge lifecycle and rewards are still in development." />
          }
        >
          {!address ? (
            <DeniedState
              title="Wallet connection required"
              message="Connect your wallet to view your badges."
            />
          ) : profileLoading ? (
            <LoadingState />
          ) : profileIsError && !(isApiError(profileError) && profileError.code === 'aborted') ? (
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
              title="Badges are coming soon"
              message="This is a preview of the badges feature. Complete community milestones to earn badges once the full badge system launches."
            />
          )}
        </Section>

        <Section title="Gated Resources">
          {!address ? (
            <DeniedState
              title="Wallet connection required"
              message="Connect your wallet to view available resources."
            />
          ) : !features.resources ? (
            <EmptyState
              title="Resources not enabled"
              message="Resources are not available in the current environment."
            />
          ) : resourcesLoading ? (
            <LoadingState message="Loading resources..." />
          ) : resourcesIsError && !(isApiError(resourcesError) && resourcesError.code === 'aborted') ? (
            <ErrorState
              title="Failed to load resources"
              message={safeErrorMessage(resourcesError)}
              onRetry={() => refetchResources()}
            />
          ) : resources && resources.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm">Explore resources based on your tier.</div>
              <div className="flex flex-wrap items-center gap-2">
                {resources.map((resource) => {
                  const href = getResourceHref(resource);
                  const accessible = hasAccessToResource(resource);
                  if (!href) {
                    return (
                      <Badge key={resource.id} variant="outline" className="opacity-60">
                        {resource.title}
                      </Badge>
                    );
                  }
                  return (
                    <Link
                      key={resource.id}
                      href={href}
                      className={buttonVariants({
                        variant: accessible ? "default" : "outline",
                      })}
                    >
                      {resource.title}
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState
              title="No resources available"
              message="No resources have been configured for this community yet."
            />
          )}
        </Section>
      </div>
    </div>
  );
}
