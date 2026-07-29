"use client";

import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { PieChart as PieIcon, Layers, ShieldCheck, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AssetItem {
  name: string;
  symbol: string;
  value: number;
  allocationPercent: number;
  color: string;
  apy: number;
  strategy: string;
}

export const MOCK_ASSETS: AssetItem[] = [
  {
    name: "ETH-USDC LP Vault",
    symbol: "ETH-USDC",
    value: 12850.5,
    allocationPercent: 42.5,
    color: "#6366F1", // Indigo
    apy: 14.8,
    strategy: "Concentrated Liquidity",
  },
  {
    name: "Lido Staked ETH",
    symbol: "stETH",
    value: 8460.2,
    allocationPercent: 28.0,
    color: "#10B981", // Emerald
    apy: 4.2,
    strategy: "Liquid Staking",
  },
  {
    name: "GuildPass Governance Pool",
    symbol: "gPASS",
    value: 5440.0,
    allocationPercent: 18.0,
    color: "#F59E0B", // Amber
    apy: 22.5,
    strategy: "Protocol Revenue Share",
  },
  {
    name: "USDC Stable Vault",
    symbol: "USDC",
    value: 3480.1,
    allocationPercent: 11.5,
    color: "#3B82F6", // Blue
    apy: 8.5,
    strategy: "Single-Sided Lending",
  },
];

interface AssetBreakdownProps {
  assets?: AssetItem[];
  isEmpty?: boolean;
  className?: string;
}

export function AssetBreakdown({ assets = MOCK_ASSETS, isEmpty = false, className }: AssetBreakdownProps) {
  const totalValue = assets.reduce((sum, item) => sum + item.value, 0);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-sm transition-colors",
        className
      )}
      data-testid="asset-breakdown-container"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <PieIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            Asset Allocation
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Distribution across active yield strategies & vaults
          </p>
        </div>

        {!isEmpty && (
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-900 px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-800">
            {assets.length} Active Vaults
          </span>
        )}
      </div>

      {isEmpty ? (
        <div
          className="flex h-[280px] w-full flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 p-6 text-center"
          data-testid="asset-breakdown-empty"
        >
          <Layers className="h-8 w-8 text-zinc-400 dark:text-zinc-600 mb-2" />
          <h5 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">No Asset Allocation</h5>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs">
            Once you deposit into a yield pool or vault, your portfolio composition will be charted here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Donut Chart */}
          <div className="md:col-span-5 h-[220px] relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={assets}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {assets.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload as AssetItem;
                      return (
                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 p-2.5 shadow-xl text-xs">
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100">{item.name}</div>
                          <div className="text-zinc-500 mt-0.5">
                            {formatCurrency(item.value)} ({item.allocationPercent}%)
                          </div>
                          <div className="text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                            {item.apy}% APY
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Center Total Summary */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
              <span className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider">Total</span>
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                {formatCurrency(totalValue)}
              </span>
            </div>
          </div>

          {/* Allocation List */}
          <div className="md:col-span-7 space-y-3">
            {assets.map((asset) => (
              <div
                key={asset.symbol}
                className="group p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 transition-all"
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: asset.color }} />
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {asset.name}
                    </span>
                    <span className="text-[10px] text-zinc-400 bg-zinc-200/60 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                      {asset.symbol}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                      {formatCurrency(asset.value)}
                    </span>
                    <span className="ml-2 text-zinc-500 font-medium">{asset.allocationPercent}%</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden mb-1">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${asset.allocationPercent}%`, backgroundColor: asset.color }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span>Strategy: {asset.strategy}</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center">
                    {asset.apy}% APY <ArrowUpRight className="h-3 w-3 ml-0.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
