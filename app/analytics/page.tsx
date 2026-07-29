"use client";

import React, { useState } from "react";
import { Nav } from "@/components/nav";
import { PortfolioChart, type Timeframe } from "@/components/analytics/PortfolioChart";
import { AssetBreakdown } from "@/components/analytics/AssetBreakdown";
import { YieldPerformanceSummary } from "@/components/analytics/YieldPerformanceSummary";
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  BarChart3,
  TrendingUp,
  Sparkles,
  RefreshCw,
  Coins,
  ArrowUpRight,
  ShieldAlert,
  Sliders,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StrategyPool {
  id: string;
  name: string;
  category: string;
  stakedBalance: number;
  apy: number;
  return30D: number;
  unclaimedYield: number;
  status: "Active" | "Boosting" | "Paused";
}

const INITIAL_POOLS: StrategyPool[] = [
  {
    id: "pool-1",
    name: "ETH-USDC Concentrated Vault",
    category: "Uniswap v3 LP",
    stakedBalance: 12850.5,
    apy: 14.8,
    return30D: 385.2,
    unclaimedYield: 142.8,
    status: "Boosting",
  },
  {
    id: "pool-2",
    name: "Lido Liquid Staking (stETH)",
    category: "ETH Liquid Staking",
    stakedBalance: 8460.2,
    apy: 4.2,
    return30D: 29.5,
    unclaimedYield: 12.4,
    status: "Active",
  },
  {
    id: "pool-3",
    name: "GuildPass Revenue Share Pool",
    category: "Protocol Governance",
    stakedBalance: 5440.0,
    apy: 22.5,
    return30D: 102.0,
    unclaimedYield: 85.6,
    status: "Boosting",
  },
  {
    id: "pool-4",
    name: "USDC Stablecoin Vault",
    category: "Aave v3 Core",
    stakedBalance: 3480.1,
    apy: 8.5,
    return30D: 24.6,
    unclaimedYield: 9.2,
    status: "Active",
  },
];

export default function AnalyticsPage() {
  const [isEmptyState, setIsEmptyState] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>("1M");
  const [pools, setPools] = useState<StrategyPool[]>(INITIAL_POOLS);
  const [claimNotification, setClaimNotification] = useState<string | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

  const totalUnclaimed = pools.reduce((sum, p) => sum + p.unclaimedYield, 0);

  const handleClaimAll = () => {
    if (totalUnclaimed === 0) return;
    setIsClaiming(true);
    setTimeout(() => {
      setPools((prev) => prev.map((p) => ({ ...p, unclaimedYield: 0 })));
      setIsClaiming(false);
      setClaimNotification(`Successfully claimed ${formatCurrency(totalUnclaimed)} in yield rewards!`);
      setTimeout(() => setClaimNotification(null), 5000);
    }, 1200);
  };

  const handleClaimPool = (id: string) => {
    const target = pools.find((p) => p.id === id);
    if (!target || target.unclaimedYield === 0) return;

    setPools((prev) =>
      prev.map((p) => (p.id === id ? { ...p, unclaimedYield: 0 } : p))
    );
    setClaimNotification(`Claimed ${formatCurrency(target.unclaimedYield)} from ${target.name}!`);
    setTimeout(() => setClaimNotification(null), 5000);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col" data-testid="analytics-page">
      <Nav />

      <main className="flex-1 mx-auto max-w-6xl w-full px-4 py-8 space-y-8">
        {/* Toast Notification */}
        {claimNotification && (
          <div
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 p-4 text-sm font-semibold text-emerald-800 dark:text-emerald-200 shadow-xl transition-all"
            role="alert"
          >
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <span>{claimNotification}</span>
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b pb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl flex items-center gap-2.5">
                <BarChart3 className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                Portfolio Analytics
              </h1>
              <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 px-3 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                v2.4 Live
              </span>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Track historical portfolio performance, yield compounding, and asset allocation across DeFi strategies.
            </p>
          </div>

          {/* Interactive State & Action Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Toggle Empty / Active State for testing */}
            <button
              type="button"
              onClick={() => setIsEmptyState(!isEmptyState)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-card px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors shadow-sm"
              title="Toggle between active portfolio data and empty state"
              data-testid="toggle-empty-state-btn"
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>State: {isEmptyState ? "Empty User" : "Active Portfolio"}</span>
            </button>

            {!isEmptyState && (
              <button
                type="button"
                onClick={handleClaimAll}
                disabled={isClaiming || totalUnclaimed === 0}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all",
                  totalUnclaimed > 0
                    ? "bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                    : "bg-zinc-300 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed"
                )}
                data-testid="claim-all-yield-btn"
              >
                {isClaiming ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Coins className="h-4 w-4" />
                )}
                <span>Claim All Yield ({formatCurrency(totalUnclaimed)})</span>
              </button>
            )}
          </div>
        </div>

        {/* Top Summary Metrics */}
        <YieldPerformanceSummary isEmpty={isEmptyState} />

        {/* Primary Portfolio Performance Chart */}
        <PortfolioChart
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          isEmpty={isEmptyState}
          onStartStaking={() => setIsEmptyState(false)}
        />

        {/* Asset Breakdown & Strategy Overview Grid */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Asset Composition Donut Chart */}
          <div className="lg:col-span-12">
            <AssetBreakdown isEmpty={isEmptyState} />
          </div>
        </div>

        {/* Strategy Yield Table */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Active Staking Strategies & Vaults
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Per-vault performance, 30-day historical returns, and unclaimed rewards
              </p>
            </div>
          </div>

          {isEmptyState ? (
            <div className="py-8 text-center text-xs text-zinc-500">
              No active strategies found for this account.
            </div>
          ) : (
            <ResponsiveTable>
              <table className="w-full text-left text-xs" data-testid="strategy-pools-table">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-3">Strategy / Pool</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3 text-right">Staked Balance</th>
                    <th className="py-3 px-3 text-right">Current APY</th>
                    <th className="py-3 px-3 text-right">30D Returns</th>
                    <th className="py-3 px-3 text-right">Unclaimed Yield</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {pools.map((pool) => (
                    <tr key={pool.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                      <td data-label="Strategy / Pool" className="py-3 px-3 font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        {pool.name}
                        {pool.status === "Boosting" && (
                          <span className="rounded bg-amber-100 dark:bg-amber-950/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                            2x Boost
                          </span>
                        )}
                      </td>
                      <td data-label="Category" className="py-3 px-3 text-zinc-500 dark:text-zinc-400">{pool.category}</td>
                      <td data-label="Staked Balance" className="py-3 px-3 text-right font-semibold text-zinc-900 dark:text-zinc-100">
                        {formatCurrency(pool.stakedBalance)}
                      </td>
                      <td data-label="Current APY" className="py-3 px-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {pool.apy}%
                      </td>
                      <td data-label="30D Returns" className="py-3 px-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                        +{formatCurrency(pool.return30D)}
                      </td>
                      <td data-label="Unclaimed Yield" className="py-3 px-3 text-right font-bold text-zinc-900 dark:text-zinc-100">
                        {formatCurrency(pool.unclaimedYield)}
                      </td>
                      <td data-label="Action" className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleClaimPool(pool.id)}
                          disabled={pool.unclaimedYield === 0}
                          className={cn(
                            "rounded px-2.5 py-1 text-[11px] font-semibold transition-colors",
                            pool.unclaimedYield > 0
                              ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800"
                              : "bg-zinc-100 dark:bg-zinc-900 text-zinc-400 cursor-not-allowed"
                          )}
                        >
                          {pool.unclaimedYield > 0 ? "Claim" : "Claimed"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          )}
        </div>
      </main>
    </div>
  );
}
