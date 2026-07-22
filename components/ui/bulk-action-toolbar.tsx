"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface BulkResult {
  succeeded: number;
  failed: number;
  items: { address: string; status: "ok" | "error"; error?: string }[];
}

interface BulkActionToolbarProps {
  selectedCount: number;
  totalCount: number;
  onDismiss: () => void;
  onBulkAction: () => Promise<void>;
  actionLabel: string;
  isPending: boolean;
  results: BulkResult | null;
  onRetryFailed: () => Promise<void>;
}

/**
 * Toolbar that appears when items are selected in a list page (members, policies).
 *
 * Provides:
 * - "N of M selected" label
 * - Bulk action button with loading state
 * - Results summary after the operation (succeeded / failed)
 * - Retry-failed button when there are failures
 * - Dismiss/clear selection button
 */
export function BulkActionToolbar({
  selectedCount,
  totalCount,
  onDismiss,
  onBulkAction,
  actionLabel,
  isPending,
  results,
  onRetryFailed,
}: BulkActionToolbarProps) {
  const hasFailures = results && results.failed > 0;

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-accent/30 p-3">
      {/* ── Selection bar ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="default">
            {selectedCount} of {totalCount} selected
          </Badge>
          {!results && (
            <>
              <Button
                size="sm"
                onClick={onBulkAction}
                disabled={isPending || selectedCount === 0}
              >
                {isPending ? "Applying…" : actionLabel}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onDismiss}
                disabled={isPending}
              >
                Clear
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Results summary ───────────────────────────────────────────── */}
      {results && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {results.succeeded > 0 && (
            <span className="text-green-600 dark:text-green-400">
              {results.succeeded} succeeded
            </span>
          )}
          {hasFailures && (
            <span className="text-destructive">
              {results.failed} failed
            </span>
          )}
          {hasFailures && (
            <Button
              size="sm"
              variant="outline"
              onClick={onRetryFailed}
              disabled={isPending}
            >
              Retry failed
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={onDismiss}
            disabled={isPending}
          >
            Done
          </Button>
        </div>
      )}

      {/* ── Per-item errors (collapsed view) ──────────────────────────── */}
      {results && results.failed > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            Show details ({results.failed} error{results.failed !== 1 ? "s" : ""})
          </summary>
          <ul className="mt-1 space-y-0.5 pl-4">
            {results.items
              .filter((r) => r.status === "error")
              .map((r) => (
                <li key={r.address} className="text-destructive truncate">
                  {r.address.slice(0, 10)}…:{r.address.slice(-4)} —{" "}
                  {r.error ?? "Unknown error"}
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
