"use client";

import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { getApi } from "@/lib/api";
import { useParams } from "next/navigation";
import type { AnalyticsSummary, MemberGrowthDataPoint, ResourceAccessCount } from "@/lib/api";
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

// ── Member growth bar chart (SVG, no external dependencies) ──────────────────

function MemberGrowthChart({ data }: { data: MemberGrowthDataPoint[] }) {
  if (data.length === 0) return null;

  const maxNew = Math.max(...data.map((d) => d.newMembers), 1);
  const chartHeight = 80;
  const barWidth = 8;
  const gap = 2;
  const totalWidth = data.length * (barWidth + gap) - gap;
  const labelEvery = Math.ceil(data.length / 6);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          New Members (Last 30 Days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${totalWidth} ${chartHeight + 20}`}
            aria-label="Bar chart of new members joined per day over the last 30 days"
            role="img"
            className="w-full"
            style={{ minWidth: totalWidth }}
          >
            {data.map((point, i) => {
              const barH = Math.max(
                2,
                (point.newMembers / maxNew) * chartHeight,
              );
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
                    aria-label={`${point.date}: ${point.newMembers} new members`}
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
          Total members at end of period:{" "}
          <span className="font-medium text-foreground">
            {data[data.length - 1]?.totalMembers ?? 0}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

// ── Resource access table ─────────────────────────────────────────────────────

function ResourceAccessTable({ data }: { data: ResourceAccessCount[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Resource Access Summary</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-left text-sm">
            <thead className="bg-muted text-muted-foreground uppercase text-xs font-semibold tracking-wider">
              <tr>
                <th className="px-4 py-3">Resource</th>
                <th className="px-4 py-3 text-right">Total Accesses</th>
                <th className="px-4 py-3 text-right">Denied</th>
                <th className="px-4 py-3 text-right">Denial Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-transparent text-card-foreground">
              {data.map((row) => {
                const denialRate =
                  row.accessCount > 0
                    ? ((row.deniedCount / row.accessCount) * 100).toFixed(1)
                    : "0.0";
                return (
                  <tr key={row.resourceId} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {row.resourceTitle}
                      <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                        ({row.resourceId})
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.accessCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-600 dark:text-red-400">
                      {row.deniedCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {denialRate}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
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
  } = useQuery<AnalyticsSummary>({
    queryKey: [...queryKeys.analytics.summary(communitySlug), address, authSession?.token ?? "anonymous"],
    queryFn: async ({ signal }) => {
      try {
        return await getApi(address, authSession?.token, communitySlug).getAnalyticsSummary(signal);
      } catch (err) {
        if (isApiError(err) && err.code === 'aborted') throw err;
        if (isApiError(err) && err.code === "unauthorized") {
          markExpired();
        }
        throw err;
      }
    },
    enabled: !!address && sessionStatus === "authenticated",
    retry: (failureCount, err) => {
      if (isApiError(err) && err.code === 'aborted') return false;
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
          Community growth and resource access overview.{" "}
          <span className="font-medium text-yellow-600 dark:text-yellow-400">
            Mock data — live endpoint pending backend confirmation (issue #157).
          </span>
        </p>
      </div>

      <hr className="border-border" />

      {/* Content states */}
      {isSessionExpired ? (
        <SessionExpiredState />
      ) : isLoading ? (
        <LoadingState message="Loading analytics…" />
      ) : isError && !(isApiError(error) && error.code === 'aborted') ? (
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
              description={`${((summary.activeMembers / summary.totalMembers) * 100).toFixed(0)}% of total`}
            />
            <StatCard
              label="New (30 Days)"
              value={summary.memberGrowth
                .reduce((s, d) => s + d.newMembers, 0)
                .toLocaleString()}
            />
            <StatCard
              label="Resources Tracked"
              value={summary.resourceAccess.length}
            />
          </div>

          {/* Member growth chart */}
          <MemberGrowthChart data={summary.memberGrowth} />

          {/* Resource access table */}
          <ResourceAccessTable data={summary.resourceAccess} />

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
