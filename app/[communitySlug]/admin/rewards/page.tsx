"use client";

import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { getApi } from "@/lib/api";
import { useParams } from "next/navigation";
import type { MemberRow } from "@/lib/api";
import { isApiError } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query";
import { FeatureGate } from "@/components/feature-gate";
import { AdminGuard } from "@/components/admin-guard";
import { features } from "@/lib/features";
import { useSiweAuth } from "@/lib/wallet/providers";
import {
  ErrorState,
  LoadingState,
  safeErrorMessage,
} from "@/components/ui/api-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ── Session-expired re-auth helper ────────────────────────────────────────────

function SessionExpiredState() {
  const { signIn, isSigningIn } = useSiweAuth();
  return (
    <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
      <p className="font-medium">Admin session expired</p>
      <p className="mt-0.5 text-xs opacity-80">
        Re-authenticate with your wallet to load rewards.
      </p>
      <Button
        size="sm"
        variant="outline"
        className="mt-3"
        onClick={signIn}
        disabled={isSigningIn}
      >
        {isSigningIn ? "Signing…" : "Re-authenticate"}
      </Button>
    </div>
  );
}

// ── Preview badge ─────────────────────────────────────────────────────────────

function PreviewBadge() {
  return (
    <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
      Preview
    </Badge>
  );
}

// ── Member reward card ────────────────────────────────────────────────────────

interface MemberRewardRowProps {
  member: MemberRow;
}

function MemberRewardRow({ member }: MemberRewardRowProps) {
  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <CardTitle className="text-base font-semibold text-foreground">
                {member.address.slice(0, 6)}
              </CardTitle>
              <code className="text-xs text-muted-foreground">
                {member.address}
              </code>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Tier: <span className="font-medium text-foreground">{member.tier}</span>
              {member.active && (
                <>
                  {" "}
                  • <span className="text-green-600 dark:text-green-400">Active</span>
                </>
              )}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Roles section */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Roles
            </p>
            {member.roles && member.roles.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {member.roles.map((role) => (
                  <Badge key={role} variant="default">
                    {role}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No roles</p>
            )}
          </div>

          {/* Deferred sections (placeholder) */}
          <hr className="border-border" />

          <div className="space-y-1.5 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/40"></span>
              <span className="italic">Streak data — awaiting backend streak engine</span>
            </p>
            <p className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/40"></span>
              <span className="italic">
                Reward eligibility — awaiting backend reward computation
              </span>
            </p>
            <p className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/40"></span>
              <span className="italic">
                Reward history — awaiting distribution audit log
              </span>
            </p>
            <p className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/40"></span>
              <span className="italic">
                Badges — awaiting badge lifecycle management
              </span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main rewards content ──────────────────────────────────────────────────────

function RewardsContent() {
  const { address } = useAccount();
  const { authSession, markExpired, sessionStatus } = useSiweAuth();
  const params = useParams();
  const communitySlug = (params?.communitySlug as string) || 'guildpass-demo';

  const {
    data: members,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<MemberRow[]>({
    queryKey: [...queryKeys.members.all(communitySlug), address, authSession?.token ?? "anonymous"],
    queryFn: async ({ signal }) => {
      try {
        const paginated = await getApi(address, authSession?.token, communitySlug).listMembers(
          {},
          signal
        );
        return Array.isArray(paginated) ? paginated : paginated.members;
      } catch (err) {
        if (isApiError(err) && err.code === "aborted") throw err;
        if (isApiError(err) && err.code === "unauthorized") {
          markExpired();
        }
        throw err;
      }
    },
    enabled: !!address && sessionStatus === "authenticated",
    retry: (failureCount, err) => {
      if (isApiError(err) && err.code === "aborted") return false;
      if (isApiError(err) && err.code === "unauthorized") return false;
      return failureCount < 1;
    },
    staleTime: 60_000,
  });

  const isSessionExpired =
    isApiError(error) && (error as { code?: string }).code === "unauthorized";

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Rewards
          </h1>
          <PreviewBadge />
        </div>
        <p className="text-sm text-muted-foreground">
          Member reward eligibility, streaks, and earned badges.{" "}
          <span className="font-medium text-amber-600 dark:text-amber-400">
            This is a read-only preview pending reward engine maturity on the backend.
          </span>
        </p>
      </div>

      <hr className="border-border" />

      {/* Content states */}
      {isSessionExpired ? (
        <SessionExpiredState />
      ) : isLoading ? (
        <LoadingState message="Loading rewards…" />
      ) : isError && !(isApiError(error) && error.code === "aborted") ? (
        <ErrorState
          title="Error loading rewards"
          message={safeErrorMessage(error)}
          onRetry={() => refetch()}
        />
      ) : members && members.length > 0 ? (
        <div className="space-y-4">
          {/* Deferred features note */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-900/10 dark:text-amber-200">
            <p className="font-semibold">Deferred features (pending backend support)</p>
            <ul className="mt-2 list-inside space-y-1 text-xs opacity-90">
              <li>
                • <strong>Reward Distribution Engine:</strong> On-chain and off-chain
                reward computation and eligibility
              </li>
              <li>
                • <strong>Streak System:</strong> Member engagement tracking and
                streak data
              </li>
              <li>
                • <strong>Reward History Audit:</strong> Audit logs of distributed
                rewards
              </li>
              <li>
                • <strong>Badge Lifecycle:</strong> Badge earning, revocation, and
                expiry rules
              </li>
            </ul>
          </div>

          {/* Member rewards list */}
          <div>
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              Members ({members.length})
            </h2>
            <div className="space-y-3">
              {members.map((member) => (
                <MemberRewardRow key={member.address} member={member} />
              ))}
            </div>
          </div>

          {/* Backend integration note */}
          <div className="mt-8 rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Implementation Notes
            </p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>
                • Currently displays member tier and roles as a proof-of-concept.
              </li>
              <li>
                • Backend reward endpoints are not yet available; this page will
                evolve as the guildpass-core reward engine matures.
              </li>
              <li>
                • See{" "}
                <code className="rounded bg-background px-1 py-0.5 font-mono text-xs">
                  docs/rewards-deferred.md
                </code>{" "}
                for the full backend contract.
              </li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">No members found.</p>
        </div>
      )}
    </div>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function RewardsPage() {
  return (
    <FeatureGate enabled={features.rewards} name="Rewards">
      <AdminGuard>
        <RewardsContent />
      </AdminGuard>
    </FeatureGate>
  );
}
