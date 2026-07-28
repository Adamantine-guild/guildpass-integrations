"use client";

import React from "react";
import { TrendingUp, Coins, DollarSign, Percent, Sparkles, Award } from "lucide-react";
import { cn } from "@/lib/utils";

interface SummaryMetrics {
  totalValue: number;
  totalYieldEarned: number;
  allTimePnlPercent: number;
  allTimePnlValue: number;
  averageApy: number;
  bestStrategy: string;
}

const DEFAULT_METRICS: SummaryMetrics = {
  totalValue: 30230.8,
  totalYieldEarned: 2430.5,
  allTimePnlPercent: 18.4,
  allTimePnlValue: 4710.2,
  averageApy: 12.6,
  bestStrategy: "ETH-USDC LP Vault (14.8% APY)",
};

interface YieldPerformanceSummaryProps {
  metrics?: SummaryMetrics;
  isEmpty?: boolean;
  className?: string;
}

export function YieldPerformanceSummary({
  metrics = DEFAULT_METRICS,
  isEmpty = false,
  className,
}: YieldPerformanceSummaryProps) {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

  if (isEmpty) {
    return (
      <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
        {[
          { label: "Staked Balance", value: "$0.00", icon: DollarSign },
          { label: "Total Yield Earned", value: "$0.00", icon: Coins },
          { label: "All-Time PnL", value: "0.00%", icon: TrendingUp },
          { label: "Avg Yield Rate", value: "0.00%", icon: Percent },
        ].map((item, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-sm"
          >
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs font-medium">{item.label}</span>
              <item.icon className="h-4 w-4" />
            </div>
            <div className="text-xl font-bold text-zinc-400 dark:text-zinc-600">{item.value}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)} data-testid="yield-summary-container">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Value */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-1">
            <span className="text-xs font-medium">Total Portfolio Value</span>
            <div className="rounded-full bg-indigo-50 dark:bg-indigo-950/60 p-1.5 text-indigo-600 dark:text-indigo-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {formatCurrency(metrics.totalValue)}
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            +5.4% from last week
          </span>
        </div>

        {/* Total Yield */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-1">
            <span className="text-xs font-medium">Total Yield Harvested</span>
            <div className="rounded-full bg-emerald-50 dark:bg-emerald-950/60 p-1.5 text-emerald-600 dark:text-emerald-400">
              <Coins className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            +{formatCurrency(metrics.totalYieldEarned)}
          </div>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Auto-compounded daily
          </span>
        </div>

        {/* All-Time PnL */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-1">
            <span className="text-xs font-medium">All-Time Net PnL</span>
            <div className="rounded-full bg-blue-50 dark:bg-blue-950/60 p-1.5 text-blue-600 dark:text-blue-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            +{metrics.allTimePnlPercent}%
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            +{formatCurrency(metrics.allTimePnlValue)} total gain
          </span>
        </div>

        {/* Avg APY */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-1">
            <span className="text-xs font-medium">Weighted APY</span>
            <div className="rounded-full bg-amber-50 dark:bg-amber-950/60 p-1.5 text-amber-600 dark:text-amber-400">
              <Percent className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {metrics.averageApy}%
          </div>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
            <Award className="h-3 w-3 text-indigo-500" /> Best: {metrics.bestStrategy}
          </span>
        </div>
      </div>
    </div>
  );
}
