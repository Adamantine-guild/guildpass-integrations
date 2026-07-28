"use client";

import { useEffect, useMemo, useState } from "react";
import type { MemberRow, MembershipTier, Role } from "@/lib/api";
import {
  ROLE_FILTER_OPTIONS,
  TIER_FILTER_OPTIONS,
  filterMembers,
} from "@/lib/members/filter-members";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { usePagination } from "@/lib/hooks/usePagination";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/api-states";
import { AddressText } from "@/components/wallet/address-text";
import { BulkActionToolbar, type BulkResult } from "@/components/ui/bulk-action-toolbar";
import { Users } from "lucide-react";
import Link from "next/link";

const SEARCH_DEBOUNCE_MS = 300;

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export interface MemberListProps {
  /** All members fetched so far, in fetch order — never mutated by this component. */
  members: MemberRow[];
  showProfileLink: boolean;
  /** Lower-cased address of a role mutation currently in flight, if any. */
  pendingAddress?: string;
  onRequestRoleRemoval: (member: MemberRow, role: Role) => void;

  selectedAddresses: Set<string>;
  onToggleSelect: (address: string) => void;

  bulkRole: Role;
  onBulkRoleChange: (role: Role) => void;
  onBulkAssign: () => Promise<void>;
  onClearSelection: () => void;
  onRetryFailedBulk: () => Promise<void>;
  isBulkPending: boolean;
  bulkResults: BulkResult | null;
}

export function MemberList({
  members,
  showProfileLink,
  pendingAddress,
  onRequestRoleRemoval,
  selectedAddresses,
  onToggleSelect,
  bulkRole,
  onBulkRoleChange,
  onBulkAssign,
  onClearSelection,
  onRetryFailedBulk,
  isBulkPending,
  bulkResults,
}: MemberListProps) {
  const [searchInput, setSearchInput] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [tierFilter, setTierFilter] = useState<MembershipTier | "all">("all");
  const [pageSize, setPageSize] = useState(25);

  // The visible input updates immediately; only the value used for filtering
  // is debounced, so typing never feels laggy while results still settle.
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);

  const filteredMembers = useMemo(
    () =>
      filterMembers(members, {
        search: debouncedSearch,
        role: roleFilter,
        tier: tierFilter,
      }),
    [members, debouncedSearch, roleFilter, tierFilter],
  );

  const { paginatedItems, currentPage, totalPages, nextPage, prevPage, setCurrentPage } =
    usePagination(filteredMembers, pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, roleFilter, tierFilter, pageSize, setCurrentPage]);

  const isFiltered = searchInput.trim() !== "" || roleFilter !== "all" || tierFilter !== "all";
  const hasVisibleMembers = filteredMembers.length > 0;
  const selectedAddressArray = Array.from(selectedAddresses);

  const clearFilters = () => {
    setSearchInput("");
    setRoleFilter("all");
    setTierFilter("all");
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_10rem_auto] sm:items-end">
        <div className="space-y-1">
          <label htmlFor="member-search-input" className="text-xs font-medium text-muted-foreground">
            Search members
          </label>
          <Input
            id="member-search-input"
            type="search"
            placeholder="Search by wallet address or name…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="member-role-filter" className="text-xs font-medium text-muted-foreground">
            Role
          </label>
          <Select
            id="member-role-filter"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as Role | "all")}
          >
            <option value="all">All roles</option>
            {ROLE_FILTER_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {capitalize(r)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor="member-tier-filter" className="text-xs font-medium text-muted-foreground">
            Tier
          </label>
          <Select
            id="member-tier-filter"
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value as MembershipTier | "all")}
          >
            <option value="all">All tiers</option>
            {TIER_FILTER_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {capitalize(t)}
              </option>
            ))}
          </Select>
        </div>
        {isFiltered && (
          <Button variant="outline" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {!hasVisibleMembers ? (
        <EmptyState
          title="No matching members"
          message="No members match your current filters."
          icon={<Users className="h-10 w-10" aria-hidden="true" />}
          actions={
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <CardHeader className="px-0 pt-0 pb-4 border-b-0">
            <CardTitle>Member List</CardTitle>
          </CardHeader>

          {selectedAddressArray.length > 0 && (
            <div className="space-y-2">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
                <div />
                <Select value={bulkRole} onChange={(e) => onBulkRoleChange(e.target.value as Role)}>
                  <option value="member">member</option>
                  <option value="moderator">moderator</option>
                  <option value="admin">admin</option>
                </Select>
              </div>
              <BulkActionToolbar
                selectedCount={selectedAddressArray.length}
                totalCount={filteredMembers.length}
                onDismiss={onClearSelection}
                onBulkAction={onBulkAssign}
                actionLabel={`Assign ${bulkRole} to selected`}
                isPending={isBulkPending}
                results={bulkResults}
                onRetryFailed={onRetryFailedBulk}
              />
            </div>
          )}

          <div className="space-y-2">
            {paginatedItems.map((m) => (
              <div
                key={m.address}
                className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between h-full bg-card"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedAddresses.has(m.address)}
                    onChange={() => onToggleSelect(m.address)}
                    className="h-4 w-4 rounded border-gray-300"
                    aria-label={`Select ${m.address}`}
                  />
                  <AddressText address={m.address} className="text-sm" />
                  {showProfileLink && (
                    <Link
                      href={`/members/${m.address}`}
                      className="text-xs text-primary underline-offset-4 hover:underline"
                    >
                      View profile
                    </Link>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Tier: {m.tier}</span>
                  <div className="flex flex-wrap gap-1">
                    {m.roles.map((r) => (
                      <button
                        key={r}
                        type="button"
                        className="inline-flex items-center rounded-md border border-transparent bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        onClick={() => onRequestRoleRemoval(m, r)}
                        aria-label={`Remove ${r} role from ${m.address}`}
                        title={`Remove ${r} role`}
                      >
                        {r} <span aria-hidden="true">✕</span>
                      </button>
                    ))}
                  </div>
                  {pendingAddress === m.address.toLowerCase() && (
                    <Badge variant="warning">Saving</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <div className="text-sm text-muted-foreground" role="status" aria-live="polite">
              Page {currentPage} of {totalPages} ({filteredMembers.length} members)
            </div>
            <div className="flex items-center gap-2">
              <Select value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))}>
                <option value="25">25 per page</option>
                <option value="50">50 per page</option>
                <option value="100">100 per page</option>
              </Select>
              <Button variant="outline" size="sm" onClick={prevPage} disabled={currentPage === 1}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={nextPage} disabled={currentPage === totalPages}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
