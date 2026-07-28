"use client";

import React, { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Calendar, BarChart2, DollarSign, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type Timeframe = "1D" | "1W" | "1M" | "1Y" | "ALL";
export type MetricView = "value" | "yield" | "combined";

export interface DataPoint {
  timestamp: string;
  dateLabel: string;
  fullDate: string;
  portfolioValue: number;
  yieldEarned: number;
  pnlPercentage: number;
}

interface PortfolioChartProps {
  timeframe?: Timeframe;
  onTimeframeChange?: (tf: Timeframe) => void;
  isEmpty?: boolean;
  onStartStaking?: () => void;
  className?: string;
}

// Generate realistic mock historical performance data per timeframe
export function generateHistoricalData(timeframe: Timeframe): DataPoint[] {
  const pointsCount = timeframe === "1D" ? 24 : timeframe === "1W" ? 7 : timeframe === "1M" ? 30 : timeframe === "1Y" ? 12 : 36;
  const baseValue = 25000;
  const data: DataPoint[] = [];

  let currentValue = baseValue;
  let cumulativeYield = 120;

  const now = new Date();

  for (let i = pointsCount - 1; i >= 0; i--) {
    let dateLabel = "";
    let fullDate = "";

    const date = new Date(now);

    if (timeframe === "1D") {
      date.setHours(now.getHours() - i);
      dateLabel = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      fullDate = date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } else if (timeframe === "1W") {
      date.setDate(now.getDate() - i);
      dateLabel = date.toLocaleDateString([], { weekday: "short" });
      fullDate = date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
    } else if (timeframe === "1M") {
      date.setDate(now.getDate() - i);
      dateLabel = date.toLocaleDateString([], { month: "short", day: "numeric" });
      fullDate = date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
    } else if (timeframe === "1Y") {
      date.setMonth(now.getMonth() - i);
      dateLabel = date.toLocaleDateString([], { month: "short" });
      fullDate = date.toLocaleDateString([], { month: "long", year: "numeric" });
    } else {
      date.setMonth(now.getMonth() - i);
      dateLabel = date.toLocaleDateString([], { month: "short", year: "2-digit" });
      fullDate = date.toLocaleDateString([], { month: "long", year: "numeric" });
    }

    // Add controlled stochastic growth
    const changePercent = (Math.sin(i * 0.5) * 0.015) + (Math.random() * 0.02 - 0.008);
    currentValue = Math.max(10000, currentValue * (1 + changePercent));
    cumulativeYield += Math.max(2, Math.random() * 25 + 5);
    const pnl = ((currentValue - baseValue) / baseValue) * 100;

    data.push({
      timestamp: date.toISOString(),
      dateLabel,
      fullDate,
      portfolioValue: Math.round(currentValue * 100) / 100,
      yieldEarned: Math.round(cumulativeYield * 100) / 100,
      pnlPercentage: Math.round(pnl * 100) / 100,
    });
  }

  return data;
}

export function PortfolioChart({
  timeframe: externalTimeframe,
  onTimeframeChange,
  isEmpty = false,
  onStartStaking,
  className,
}: PortfolioChartProps) {
  const [internalTimeframe, setInternalTimeframe] = useState<Timeframe>("1M");
  const [metricView, setMetricView] = useState<MetricView>("value");
  const [hoveredPoint, setHoveredPoint] = useState<DataPoint | null>(null);

  const activeTimeframe = externalTimeframe ?? internalTimeframe;

  const handleTimeframeSelect = (tf: Timeframe) => {
    setInternalTimeframe(tf);
    if (onTimeframeChange) {
      onTimeframeChange(tf);
    }
  };

  const chartData = useMemo(() => {
    if (isEmpty) return [];
    return generateHistoricalData(activeTimeframe);
  }, [activeTimeframe, isEmpty]);

  const latestPoint = chartData[chartData.length - 1];
  const startPoint = chartData[0];

  const overallChange = useMemo(() => {
    if (!latestPoint || !startPoint || startPoint.portfolioValue === 0) return { diff: 0, percent: 0 };
    const diff = latestPoint.portfolioValue - startPoint.portfolioValue;
    const percent = (diff / startPoint.portfolioValue) * 100;
    return { diff, percent };
  }, [latestPoint, startPoint]);

  const displayPoint = hoveredPoint || latestPoint;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-sm transition-colors",
        className
      )}
      data-testid="portfolio-chart-container"
    >
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Portfolio Performance
            </span>
            <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              Live Subgraph
            </span>
          </div>

          {!isEmpty && displayPoint ? (
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                {formatCurrency(displayPoint.portfolioValue)}
              </span>
              <div
                className={cn(
                  "flex items-center text-sm font-semibold",
                  overallChange.percent >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                )}
              >
                {overallChange.percent >= 0 ? (
                  <TrendingUp className="mr-1 h-4 w-4" />
                ) : (
                  <TrendingDown className="mr-1 h-4 w-4" />
                )}
                <span>
                  {overallChange.percent >= 0 ? "+" : ""}
                  {overallChange.percent.toFixed(2)}% ({formatCurrency(overallChange.diff)})
                </span>
                <span className="ml-1 text-xs text-zinc-500 font-normal">in {activeTimeframe}</span>
              </div>
            </div>
          ) : (
            <div className="mt-1 text-3xl font-bold tracking-tight text-zinc-400 dark:text-zinc-600">
              $0.00
            </div>
          )}
        </div>

        {/* Timeframe & Metric View Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe Buttons */}
          <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-1">
            {(["1D", "1W", "1M", "1Y", "ALL"] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => handleTimeframeSelect(tf)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                  activeTimeframe === tf
                    ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                )}
                data-testid={`timeframe-btn-${tf}`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Metric View Toggle */}
          {!isEmpty && (
            <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-1">
              <button
                type="button"
                onClick={() => setMetricView("value")}
                title="Portfolio Value"
                className={cn(
                  "rounded-md p-1 text-xs transition-all",
                  metricView === "value"
                    ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                )}
              >
                <DollarSign className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setMetricView("yield")}
                title="Yield Earnings"
                className={cn(
                  "rounded-md p-1 text-xs transition-all",
                  metricView === "yield"
                    ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                )}
              >
                <BarChart2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Chart Canvas / Empty State */}
      {isEmpty ? (
        <div
          className="flex h-[320px] w-full flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 p-6 text-center"
          data-testid="portfolio-chart-empty"
        >
          <div className="rounded-full bg-indigo-50 dark:bg-indigo-950/60 p-3 text-indigo-600 dark:text-indigo-400 mb-3">
            <BarChart2 className="h-8 w-8" />
          </div>
          <h4 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            No Historical Data Available
          </h4>
          <p className="mt-1 max-w-sm text-xs text-zinc-500 dark:text-zinc-400">
            You do not have any active yield positions or historical snapshots recorded yet.
            Deposit into a vault or stake tokens to track your portfolio profitability.
          </p>
          {onStartStaking && (
            <button
              type="button"
              onClick={onStartStaking}
              className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors"
            >
              Start Yield Staking
            </button>
          )}
        </div>
      ) : (
        <div className="h-[320px] w-full" data-testid="portfolio-chart-canvas">
          <ResponsiveContainer width="100%" height="100%">
            {metricView === "yield" ? (
              <BarChart
                data={chartData}
                onMouseMove={(e: any) => {
                  if (e && e.activePayload && e.activePayload.length > 0) {
                    setHoveredPoint(e.activePayload[0].payload as DataPoint);
                  }
                }}
                onMouseLeave={() => setHoveredPoint(null)}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" />
                <XAxis
                  dataKey="dateLabel"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11 }}
                  className="text-zinc-500 dark:text-zinc-400"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(val) => `$${val}`}
                  className="text-zinc-500 dark:text-zinc-400"
                />
                <Tooltip content={<CustomTooltip formatCurrency={formatCurrency} />} />
                <Bar dataKey="yieldEarned" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <AreaChart
                data={chartData}
                onMouseMove={(e: any) => {
                  if (e && e.activePayload && e.activePayload.length > 0) {
                    setHoveredPoint(e.activePayload[0].payload as DataPoint);
                  }
                }}
                onMouseLeave={() => setHoveredPoint(null)}
              >
                <defs>
                  <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="yieldGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" />
                <XAxis
                  dataKey="dateLabel"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11 }}
                  className="text-zinc-500 dark:text-zinc-400"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                  domain={["auto", "auto"]}
                  className="text-zinc-500 dark:text-zinc-400"
                />
                <Tooltip content={<CustomTooltip formatCurrency={formatCurrency} />} />
                <Area
                  type="monotone"
                  dataKey="portfolioValue"
                  stroke="#6366F1"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#portfolioGradient)"
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function CustomTooltip({ active, payload, formatCurrency }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload as DataPoint;
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 p-3 shadow-xl backdrop-blur-md text-xs">
        <div className="font-semibold text-zinc-700 dark:text-zinc-300 border-b border-zinc-100 dark:border-zinc-800 pb-1.5 mb-2">
          {data.fullDate}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-zinc-500 dark:text-zinc-400">Portfolio Value:</span>
            <span className="font-bold text-zinc-900 dark:text-zinc-100">
              {formatCurrency(data.portfolioValue)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-zinc-500 dark:text-zinc-400">Yield Earned:</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              +{formatCurrency(data.yieldEarned)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-zinc-500 dark:text-zinc-400">PnL:</span>
            <span
              className={cn(
                "font-semibold",
                data.pnlPercentage >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              )}
            >
              {data.pnlPercentage >= 0 ? "+" : ""}
              {data.pnlPercentage.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
