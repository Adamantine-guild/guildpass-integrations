"use client";

import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { getApi } from "@/lib/api";
import { useParams } from "next/navigation";
import { isApiError } from "@/lib/api/errors";
import {
  computeAnalyticsSummary,
  fetchAllMembers,
  type ComputedAnalyticsSummary,
  type RoleDistributionEntry,
  type SignupsDataPoint,
  type TierDistributionEntry,
} from "@/lib/api/analytics";
import { queryKeys } from "@/lib/query";
import { FeatureGate } from "@/components/feature-gate";
import { AdminGuard } from "@/components/admin-guard";
import { features } from "@/lib/features";
import { useSiweAuth } from "@/lib/wallet/providers";
import {
  ErrorState,
  LoadingState,
  EmptyState,
  safeErrorMessage,
} from "@/components/ui/api-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  description,
}: {
  label: string;
  value: number | string;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tracking-tight text-foreground">
          {value}
        </p>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Signups-over-time bar chart (SVG, no external dependencies) ──────────────

function SignupsChart({ data }: { data: SignupsDataPoint[] }) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New Members Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No signups recorded yet"
            message="This chart is built from membership.created events in the admin event log — it will fill in as they occur."
          />
        </CardContent>
      </Card>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const chartHeight = 80;
  const barWidth = 16;
  const gap = 6;
  const totalWidth = data.length * (barWidth + gap) - gap;
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));
  const totalSignups = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New Members Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${totalWidth} ${chartHeight + 20}`}
            aria-label="Bar chart of new members per day, derived from membership.created events"
            role="img"
            className="w-full"
            style={{ minWidth: totalWidth }}
          >
            {data.map((point, i) => {
              const barH = Math.max(2, (point.count / maxCount) * chartHeight);
              const x = i * (barWidth + gap);
              const y = chartHeight - barH;
              const showLabel = i % labelEvery === 0;
              const labelDate = point.date.slice(5); // MM-DD
              return (
                <g key={point.date}>
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barH}
                    rx={1}
                    className="fill-primary"
                    aria-label={`${point.date}: ${point.count} new member${point.count === 1 ? "" : "s"}`}
                  />
                  {showLabel && (
                    <text
                      x={x + barWidth / 2}
                      y={chartHeight + 14}
                      textAnchor="middle"
                      fontSize={7}
                      className="fill-muted-foreground"
                    >
                      {labelDate}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Total signups shown:{" "}
          <span className="font-medium text-foreground">
            {totalSignups.toLocaleString()}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

// ── Distribution bars (role / tier) ───────────────────────────────────────────

function DistributionBars({
  title,
  items,
}: {
  title: string;
  items: { label: string; count: number }[];
}) {
  const max = Math.max(...items.map((i) => i.count), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium capitalize text-foreground">
                {item.label}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {item.count.toLocaleString()}
              </span>
            </div>
            <div
              role="img"
              aria-label={`${item.label}: ${item.count}`}
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function roleItems(distribution: RoleDistributionEntry[]) {
  return distribution.map((entry) => ({ label: entry.role, count: entry.count }));
}

function tierItems(distribution: TierDistributionEntry[]) {
  return distribution.map((entry) => ({ label: entry.tier, count: entry.count }));
}

// ── Session-expired re-auth helper ────────────────────────────────────────────

function SessionExpiredState() {
  const { signIn, isSigningIn } = useSiweAuth();
  return (
    <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
      <p className="font-medium">Admin session expired</p>
      <p className="mt-0.5 text-xs opacity-80">
        Re-authenticate with your wallet to load analytics.
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

// ── Main analytics content ────────────────────────────────────────────────────

function AnalyticsContent() {
  const { address } = useAccount();
  const { authSession, markExpired, sessionStatus } = useSiweAuth();
  const params = useParams();
  const communitySlug = (params?.communitySlug as string) || 'guildpass-demo';

  const {
    data: summary,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ComputedAnalyticsSummary>({
    queryKey: [...queryKeys.analytics.summary(communitySlug), address, authSession?.token ?? "anonymous"],
    queryFn: async ({ signal }) => {
      try {
        const api = getApi(address, authSession?.token, communitySlug);
        const [members, events] = await Promise.all([
          fetchAllMembers(api, signal),
          api.listWebhookEvents(signal),
        ]);
        return computeAnalyticsSummary(members, events);
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
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Analytics
        </h1>
        <p className="text-sm text-muted-foreground">
          Community growth and membership overview, computed from live member
          and event data — no dedicated analytics backend required.
        </p>
      </div>

      <hr className="border-border" />

      {/* Content states */}
      {isSessionExpired ? (
        <SessionExpiredState />
      ) : isLoading ? (
        <LoadingState message="Loading analytics…" />
      ) : isError && !(isApiError(error) && error.code === "aborted") ? (
        <ErrorState
          title="Error loading analytics"
          message={safeErrorMessage(error)}
          onRetry={() => refetch()}
        />
      ) : summary ? (
        <>
          {/* KPI summary cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="Total Members"
              value={summary.totalMembers.toLocaleString()}
            />
            <StatCard
              label="Active Members"
              value={summary.activeMembers.toLocaleString()}
              description={
                summary.totalMembers > 0
                  ? `${((summary.activeMembers / summary.totalMembers) * 100).toFixed(0)}% of total`
                  : undefined
              }
            />
            <StatCard
              label="Signups Recorded"
              value={summary.signupsOverTime
                .reduce((sum, d) => sum + d.count, 0)
                .toLocaleString()}
              description="From membership.created events"
            />
            <StatCard
              label="Admins"
              value={
                summary.roleDistribution.find((r) => r.role === "admin")?.count ?? 0
              }
            />
          </div>

          {/* Signups-over-time chart */}
          <SignupsChart data={summary.signupsOverTime} />

          {/* Role and tier distribution */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DistributionBars
              title="Role Distribution"
              items={roleItems(summary.roleDistribution)}
            />
            <DistributionBars
              title="Tier Distribution"
              items={tierItems(summary.tierDistribution)}
            />
          </div>

          {/* Generated-at footer */}
          <p className="text-right text-xs text-muted-foreground">
            Generated{" "}
            {new Date(summary.generatedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </>
      ) : null}
    </div>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  return (
    <FeatureGate enabled={features.analytics} name="Analytics">
      <AdminGuard>
        <AnalyticsContent />
      </AdminGuard>
    </FeatureGate>
  );
}
