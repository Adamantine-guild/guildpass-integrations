"use client";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import {
  getApi,
  type MemberProfile,
  type Membership,
  type Session,
  type WalletVerification,
} from "@/lib/api";
import { queryKeys } from "@/lib/query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  LoadingState,
  ErrorState,
  EmptyState,
  DeniedState,
  safeErrorMessage,
} from "@/components/ui/api-states";
import { AddressText } from "@/components/wallet/address-text";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const {
    data: session,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Session>({
    queryKey: queryKeys.session.byAddress(address ?? ""),
    queryFn: () => getApi(address).getSession(),
    enabled: !!address,
    retry: 1,
  });

  const {
    data: verification,
    isLoading: isVerifying,
    isError: verifyIsError,
    error: verifyError,
    refetch: refetchVerification,
  } = useQuery<WalletVerification>({
    queryKey: queryKeys.walletVerification.byAddress(address ?? ""),
    queryFn: () => getApi(address).verifyWallet(address as string),
    enabled: !!address,
    retry: 1,
  });

  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileIsError,
    error: profileError,
    refetch: refetchProfile,
  } = useQuery<MemberProfile | null>({
    queryKey: queryKeys.profile.byAddress(address ?? ""),
    queryFn: () => getApi(address).getProfile(address as string),
    enabled: !!address,
    retry: 1,
  });

  const membership: Membership | undefined = session?.membership;

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Member Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Wallet-aware member experience
          </p>
        </div>
        <div className="text-left sm:text-right">
          <div className="text-sm">
            {isConnected ? (
              <AddressText
                address={address}
                className="text-muted-foreground"
              />
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
              <div className="text-sm text-muted-foreground">
                Expires:{" "}
                {membership?.expiresAt
                  ? new Date(membership.expiresAt).toLocaleDateString()
                  : "N/A"}
              </div>
            </div>
          )}
        </Section>

        <Section title="Profile Summary">
          {!address ? (
            <DeniedState
              title="Wallet connection required"
              message="Connect your wallet to load your profile and verification state."
            />
          ) : isVerifying ? (
            <LoadingState />
          ) : verifyIsError ? (
            <ErrorState
              title="Wallet verification failed"
              message={safeErrorMessage(verifyError)}
              onRetry={() => refetchVerification()}
            />
          ) : verification ? (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                Verification:{" "}
                {verification.verified ? (
                  <Badge variant="success">Verified</Badge>
                ) : (
                  <Badge variant="destructive">Not verified</Badge>
                )}
              </div>
              {verification.method ? (
                <div className="text-sm text-muted-foreground">
                  Method: {verification.method}
                </div>
              ) : null}
              <div className="text-sm text-muted-foreground">
                Checked: {new Date(verification.checkedAt).toLocaleString()}
              </div>
            </div>
          ) : (
            <EmptyState
              title="Profile details unavailable"
              message="Basic profile details will appear here when they are available."
            />
          )}
        </Section>

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

        <Section title="Gated Resources">
          <div className="space-y-2">
            <div className="text-sm">Explore resources based on your tier.</div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/resources/alpha" className={buttonVariants()}>
                Alpha Docs
              </Link>
              <Link
                href="/resources/pro-reports"
                className={buttonVariants({ variant: "outline" })}
              >
                Pro Reports
              </Link>
              <Link
                href="/resources/mem-updates"
                className={buttonVariants({ variant: "outline" })}
              >
                Member Updates
              </Link>
              <Link
                href="/events/demo"
                className={buttonVariants({ variant: "secondary" })}
              >
                Demo Event
              </Link>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
