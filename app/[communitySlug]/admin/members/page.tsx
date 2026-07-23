"use client";

import { useAccount } from "wagmi";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApi, type MemberRow, type Role, type MembershipTier } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ToastViewport, useToasts } from "@/components/ui/toast";
import { useState, useMemo, useRef, useEffect } from "react";
import { AdminGuard } from "@/components/admin-guard";
import { useSiweAuth } from "@/lib/wallet/providers";
import { AuthError } from "@/lib/api/live";
import { queryKeys, reconcileMemberRoleCache } from "@/lib/query";
import { useParams } from "next/navigation";
import {
  LoadingState,
  ErrorState,
  EmptyState,
  DeniedState,
  safeErrorMessage,
} from "@/components/ui/api-states";
import { usePagination } from "@/lib/hooks/usePagination";
import {
  applyOptimisticRole,
  applyOptimisticRemoveRole,
} from "@/lib/api/optimistic";
import { roleRemovalConfirmationMessage } from "@/lib/api/role-removal";
import { AddressText } from "@/components/wallet/address-text";
import { isWalletAddress, normalizeAddress } from "@/lib/wallet/address";
import { BulkActionToolbar, type BulkResult } from "@/components/ui/bulk-action-toolbar";
import { Users } from "lucide-react";

type AssignRoleInput = {
  address: string;
  role: Role;
};

type AssignRoleRollback = {
  previousMembers?: MemberRow[];
};

function SessionExpiredBanner() {
  const { signIn, isSigningIn } = useSiweAuth();
  return (
    <div id="session-expired-banner">
      <DeniedState
        title="Admin session expired"
        message="Your admin session has expired."
        actions={
          <Button
            id="session-reauth-btn"
            size="sm"
            variant="outline"
            onClick={signIn}
            disabled={isSigningIn}
            className="shrink-0"
          >
            {isSigningIn ? "Signing…" : "Re-authenticate"}
          </Button>
        }
      />
    </div>
  );
}

interface VirtualListProps<T> {
  items: T[];
  rowHeight: number;
  height: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  onScrollToBottom?: () => void;
}

function VirtualList<T>({
  items,
  rowHeight,
  height,
  renderRow,
  onScrollToBottom,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLDivElement;
      setScrollTop(target.scrollTop);

      // Trigger scroll-to-bottom infinite load when 150px from bottom
      if (
        target.scrollHeight - target.scrollTop - target.clientHeight < 150
      ) {
        onScrollToBottom?.();
      }
    };

    const el = containerRef.current;
    if (el) {
      el.addEventListener("scroll", handleScroll);
    }
    return () => {
      if (el) {
        el.removeEventListener("scroll", handleScroll);
      }
    };
  }, [onScrollToBottom]);

  const totalHeight = items.length * rowHeight;
  const buffer = 5;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer);
  const endIndex = Math.min(
    items.length - 1,
    Math.floor((scrollTop + height) / rowHeight) + buffer
  );

  const visibleItems = useMemo(() => {
    const list: { item: T; index: number }[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      if (items[i] !== undefined) {
        list.push({ item: items[i], index: i });
      }
    }
    return list;
  }, [items, startIndex, endIndex]);

  return (
    <div
      ref={containerRef}
      style={{ height, overflowY: "auto", position: "relative" }}
      className="border rounded-md"
    >
      <div style={{ height: totalHeight, width: "100%", position: "relative" }}>
        {visibleItems.map(({ item, index }) => (
          <div
            key={index}
            style={{
              position: "absolute",
              top: index * rowHeight,
              left: 0,
              right: 0,
              height: rowHeight,
              padding: "4px 8px",
            }}
          >
            {renderRow(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MembersPage() {
  const { address } = useAccount();
  const { authSession, markExpired, sessionStatus } = useSiweAuth();
  const qc = useQueryClient();
  const { toasts, addToast, dismissToast } = useToasts();
  const params = useParams();
  const communitySlug = (params?.communitySlug as string) || 'guildpass-demo';

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all')
  const [tierFilter, setTierFilter] = useState<MembershipTier | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [pageSize, setPageSize] = useState(25)

  const resetFilters = () => {
    setSearchQuery('')
    setRoleFilter('all')
    setTierFilter('all')
    setStatusFilter('all')
    setPageSize(25)
  }

  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: [...queryKeys.members.all(communitySlug), { searchQuery }],
    queryFn: async ({ pageParam }) => {
      const api = getApi(address, authSession?.token, communitySlug);
      const limit = 100;
      const res = await api.listMembers({
        cursor: pageParam,
        limit,
        filter: searchQuery || undefined,
      });

      if (Array.isArray(res)) {
        return {
          members: res,
          nextCursor: undefined,
          isFallback: true,
        };
      } else {
        return {
          members: res.members,
          nextCursor: res.nextCursor,
          isFallback: false,
        };
      }
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    retry: 1,
  });

  const [addr, setAddr] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [pendingAssignment, setPendingAssignment] =
    useState<AssignRoleInput | null>(null);
  const [successAssignment, setSuccessAssignment] =
    useState<AssignRoleInput | null>(null);
  const [rollbackMessage, setRollbackMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  // ── Bulk selection state ──────────────────────────────────────────
  const [selectedAddresses, setSelectedAddresses] = useState<Set<string>>(
    new Set(),
  );
  const [bulkRole, setBulkRole] = useState<Role>("member");
  const [isBulkPending, setIsBulkPending] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult | null>(null);
  const [bulkFailedItems, setBulkFailedItems] = useState<
    { address: string; role: Role }[]
  >([]);

  const normalizedAddr = normalizeAddress(addr);
  const isValidAddress = isWalletAddress(normalizedAddr);

  const allFetchedMembers = useMemo(() => {
    return data?.pages.flatMap((page) => page.members) ?? [];
  }, [data]);

  const isFallbackMode = data?.pages[0]?.isFallback ?? false;

  const filteredMembers = useMemo(() => {
    return allFetchedMembers.filter((m) => {
      const matchesSearch =
        !isFallbackMode ||
        !searchQuery ||
        m.address.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === 'all' || m.roles.includes(roleFilter);
      const matchesTier = tierFilter === 'all' || m.tier === tierFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && m.active) ||
        (statusFilter === 'inactive' && !m.active);

      return matchesSearch && matchesRole && matchesTier && matchesStatus;
    });
  }, [allFetchedMembers, isFallbackMode, searchQuery, roleFilter, tierFilter, statusFilter]);

  const {
    paginatedItems,
    currentPage,
    totalPages,
    nextPage,
    prevPage,
    setPage,
    setCurrentPage,
  } = usePagination(filteredMembers, pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, roleFilter, tierFilter, statusFilter, pageSize, setCurrentPage]);

  const isFiltered = searchQuery || roleFilter !== 'all' || tierFilter !== 'all' || statusFilter !== 'all'
  const hasAnyMembers = allFetchedMembers.length > 0
  const hasVisibleMembers = filteredMembers.length > 0

  const {
    mutate,
    isPending,
    isError: mutateError,
    error: mutateErrorValue,
    reset: resetMutation,
  } = useMutation<void, unknown, AssignRoleInput, { previousQueries?: [any, any][] }>({
    mutationFn: (input) =>
      getApi(address, authSession?.token, communitySlug).assignRole(input.address, input.role),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: queryKeys.members.all(communitySlug) });
      const previousQueries = qc.getQueriesData({ queryKey: queryKeys.members.all(communitySlug) });

      setPendingAssignment(input);
      setSuccessAssignment(null);
      setRollbackMessage("");

      qc.setQueriesData({ queryKey: queryKeys.members.all(communitySlug) }, (old: any) => {
        if (!old) return old;
        if (Array.isArray(old)) {
          return applyOptimisticRole(old, input.address, input.role);
        }
        if (old.pages) {
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              members: applyOptimisticRole(page.members, input.address, input.role),
            })),
          };
        }
        return old;
      });

      return { previousQueries };
    },
    onSuccess: (_data, input) => {
      reconcileMemberRoleCache(qc, {
        address: input.address,
        role: input.role,
        action: "assign",
      }, communitySlug);
      setSuccessAssignment(input);
      addToast({
        tone: "success",
        title: `Role assigned to ${input.address.slice(0, 6)}…${input.address.slice(-4)}`,
        description: `The ${input.role} role was assigned successfully.`,
      });
      setAddr("");
      resetMutation();
    },
    onError: (err: unknown, _input, context) => {
      if (context?.previousQueries) {
        for (const [queryKey, oldData] of context.previousQueries) {
          qc.setQueryData(queryKey, oldData);
        }
      }
      void qc.invalidateQueries({ queryKey: queryKeys.members.all(communitySlug) });
      const isExpiredSession = err instanceof AuthError && err.code === "unauthorized";
      const message = isExpiredSession
        ? "Session expired. Use the re-authentication banner to sign in again."
        : safeErrorMessage(err);

      setRollbackMessage(`Change reverted: ${message}`);
      addToast({
        tone: isExpiredSession ? "warning" : "error",
        title: isExpiredSession ? "Admin session expired" : "Failed to assign role",
        description: message,
      });
      if (isExpiredSession) {
        markExpired();
      }
    },
    onSettled: () => {
      setPendingAssignment(null);
    },
  });

  const isAssignSessionExpired =
    mutateErrorValue instanceof AuthError && mutateErrorValue.code === "unauthorized";

  const removeRoleMutation = useMutation<
    void,
    unknown,
    AssignRoleInput,
    { previousQueries?: [any, any][] }
  >({
    mutationFn: (input) =>
      getApi(address, authSession?.token, communitySlug).removeRole(input.address, input.role),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: queryKeys.members.all(communitySlug) });
      const previousQueries = qc.getQueriesData({ queryKey: queryKeys.members.all(communitySlug) });
      setPendingAssignment(input);
      setSuccessMessage("");
      setRollbackMessage("");
      qc.setQueriesData({ queryKey: queryKeys.members.all(communitySlug) }, (old: any) => {
        if (!old) return old;
        if (Array.isArray(old)) {
          return applyOptimisticRemoveRole(old, input.address, input.role);
        }
        if (old.pages) {
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              members: applyOptimisticRemoveRole(page.members, input.address, input.role),
            })),
          };
        }
        return old;
      });
      return { previousQueries };
    },
    onSuccess: (_data, input) => {
      reconcileMemberRoleCache(qc, {
        address: input.address,
        role: input.role,
        action: "remove",
      }, communitySlug);
      setSuccessMessage(`Role "${input.role}" removed from ${input.address}.`);
      resetMutation();
    },
    onError: (err: unknown, _input, context) => {
      if (context?.previousQueries) {
        for (const [queryKey, oldData] of context.previousQueries) {
          qc.setQueryData(queryKey, oldData);
        }
      }
      void qc.invalidateQueries({ queryKey: queryKeys.members.all(communitySlug) });
      setRollbackMessage(`Change reverted: ${safeErrorMessage(err)}`);
      if (err instanceof AuthError) {
        markExpired();
      }
    },
    onSettled: () => {
      setPendingAssignment(null);
    },
  });

  const requestRoleRemoval = (member: MemberRow, roleToRemove: Role) => {
    const confirmationMessage = roleRemovalConfirmationMessage(
      member.address,
      roleToRemove,
      member.roles,
    );

    if (confirmationMessage && !window.confirm(confirmationMessage)) return;

    removeRoleMutation.mutate({
      address: member.address,
      role: roleToRemove,
    });
  };

  // ── Bulk selection helpers ────────────────────────────────────────────
  const toggleSelect = (address: string) => {
    setSelectedAddresses((prev) => {
      const next = new Set(prev);
      if (next.has(address)) {
        next.delete(address);
      } else {
        next.add(address);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pageAddresses = paginatedItems.map((m) => m.address);
    const allSelected = pageAddresses.every((a) =>
      selectedAddresses.has(a),
    );
    if (allSelected) {
      // Deselect all on this page
      setSelectedAddresses((prev) => {
        const next = new Set(prev);
        pageAddresses.forEach((a) => next.delete(a));
        return next;
      });
    } else {
      // Select all on this page
      setSelectedAddresses((prev) => {
        const next = new Set(prev);
        pageAddresses.forEach((a) => next.add(a));
        return next;
      });
    }
  };

  const clearSelection = () => {
    setSelectedAddresses(new Set());
    setBulkResults(null);
    setBulkFailedItems([]);
  };

  const selectedAddressArray = Array.from(selectedAddresses);

  const executeBulkAssign = async (items: { address: string; role: Role }[]) => {
    setIsBulkPending(true);
    setBulkResults(null);

    const api = getApi(address, authSession?.token, communitySlug);
    const results: BulkResult["items"] = [];

    const settled = await Promise.allSettled(
      items.map(async (item) => {
        try {
          await api.assignRole(item.address, item.role);
          results.push({ address: item.address, status: "ok" });
        } catch (err) {
          results.push({
            address: item.address,
            status: "error",
            error: safeErrorMessage(err),
          });
        }
      }),
    );

    const succeeded = results.filter((r) => r.status === "ok").length;
    const failed = results.filter((r) => r.status === "error").length;

    setBulkResults({ succeeded, failed, items: results });

    // Store failed items for retry
    setBulkFailedItems(
      results
        .filter((r) => r.status === "error")
        .map((r) => ({ address: r.address, role: bulkRole })),
    );

    // Refresh member list to reflect changes
    void qc.invalidateQueries({ queryKey: queryKeys.members.all(communitySlug) });

    addToast({
      tone: failed === 0 ? "success" : "warning",
      title:
        failed === 0
          ? "Bulk assignment complete"
          : `${succeeded} succeeded, ${failed} failed`,
      description:
        failed > 0
          ? "Check the details below and retry the failed items."
          : `Assigned ${bulkRole} to ${succeeded} member(s).`,
    });

    setIsBulkPending(false);
  };

  const handleBulkAssign = async () => {
    const items = selectedAddressArray.map((addr) => ({
      address: addr,
      role: bulkRole,
    }));
    await executeBulkAssign(items);
  };

  const handleRetryFailed = async () => {
    if (bulkFailedItems.length > 0) {
      await executeBulkAssign(bulkFailedItems);
    }
  };

  const pageAddresses = paginatedItems.map((m) => m.address);
  const allPageSelected =
    pageAddresses.length > 0 &&
    pageAddresses.every((a) => selectedAddresses.has(a));

  const handleScrollToBottom = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  return (
    <AdminGuard>
      <div className="space-y-4">
        <ToastViewport toasts={toasts} onDismiss={dismissToast} />
        <h1 className="text-2xl font-semibold">Members</h1>

        {sessionStatus === "expired" && <SessionExpiredBanner />}

        <Card>
          <CardHeader>
            <CardTitle>Assign Role</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
              <div className="space-y-1">
                <label
                  htmlFor="assign-role-address"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Wallet address
                </label>
                <Input
                  id="assign-role-address"
                  placeholder="0x…"
                  value={addr}
                  onChange={(e) => setAddr(e.target.value)}
                  className={
                    !isValidAddress && addr.trim() ? "border-destructive" : ""
                  }
                  aria-invalid={
                    !isValidAddress && addr.trim() ? true : undefined
                  }
                  aria-describedby={
                    !isValidAddress && addr.trim()
                      ? "assign-role-address-error"
                      : undefined
                  }
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="assign-role-select"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Role
                </label>
                <Select
                  id="assign-role-select"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  <option value="member">member</option>
                  <option value="moderator">moderator</option>
                  <option value="admin">admin</option>
                </Select>
              </div>
              <Button
                id="assign-role-btn"
                onClick={() => mutate({ address: normalizedAddr, role })}
                disabled={!isValidAddress || isPending}
                aria-busy={isPending}
              >
                {isPending ? "Assigning…" : "Assign"}
              </Button>
            </div>
            {!isValidAddress && addr.trim() && (
              <div
                id="assign-role-address-error"
                className="text-sm text-destructive"
                role="alert"
              >
                Please enter a valid wallet address (0x followed by 40
                hexadecimal characters)
              </div>
            )}
            {successAssignment && (
              <div
                className="text-sm text-green-700 dark:text-green-400"
                role="status"
              >
                Role &quot;{successAssignment.role}&quot; saved for{" "}
                <AddressText
                  address={successAssignment.address}
                  className="text-green-700 dark:text-green-400"
                />
                .
              </div>
            )}
            {successMessage && (
              <div className="text-sm text-green-700 dark:text-green-400" role="status">
                {successMessage}
              </div>
            )}
            {rollbackMessage && (
              <div className="text-sm text-destructive" role="alert">
                {rollbackMessage}
              </div>
            )}
            {mutateError && !isAssignSessionExpired && (
              <ErrorState
                title="Failed to assign role"
                message={safeErrorMessage(mutateErrorValue)}
                onRetry={() => mutate({ address: addr, role })}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            {hasAnyMembers && hasVisibleMembers && (
              <CardHeader className="px-0 pt-0 pb-4 border-b-0">
                <CardTitle>Member List</CardTitle>
              </CardHeader>
            )}
            {isLoading ? (
              <LoadingState message="Loading members…" />
            ) : isError ? (
              <ErrorState
                title="Failed to load members"
                message={safeErrorMessage(error)}
                onRetry={() => refetch()}
              />
            ) : !hasAnyMembers ? (
              <EmptyState
                title="No members yet"
                message="This community does not have any members yet. Share the connect link or follow the onboarding docs to get the first members in."
                icon={<Users className="h-10 w-10" aria-hidden="true" />}
                actions={
                  <a
                    href="/docs/admin-session-contract"
                    className="inline-flex items-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    View onboarding docs
                  </a>
                }
              />
            ) : !hasVisibleMembers ? (
              <EmptyState
                title="No matching members"
                message="Members exist, but none match the current filters. Clear the filters to see the full list."
                icon={<Users className="h-10 w-10" aria-hidden="true" />}
              />
            ) : (
               <div className="space-y-4">
                 {/* ── Bulk action toolbar ─────────────────────────── */}
                 {selectedAddressArray.length > 0 && (
                   <div className="space-y-2">
                     <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
                       <div />
                       <Select
                         value={bulkRole}
                         onChange={(e) => setBulkRole(e.target.value as Role)}
                       >
                         <option value="member">member</option>
                         <option value="moderator">moderator</option>
                         <option value="admin">admin</option>
                       </Select>
                     </div>
                     <BulkActionToolbar
                       selectedCount={selectedAddressArray.length}
                       totalCount={filteredMembers.length}
                       onDismiss={clearSelection}
                       onBulkAction={handleBulkAssign}
                       actionLabel={`Assign ${bulkRole} to selected`}
                       isPending={isBulkPending}
                       results={bulkResults}
                       onRetryFailed={handleRetryFailed}
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
                           onChange={() => toggleSelect(m.address)}
                           className="h-4 w-4 rounded border-gray-300"
                           aria-label={`Select ${m.address}`}
                         />
                         <AddressText address={m.address} className="text-sm" />
                       </div>
                       <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                         <span>Tier: {m.tier}</span>
                         <div className="flex flex-wrap gap-1">
                           {m.roles.map((r) => (
                             <button
                               key={r}
                               type="button"
                               className="inline-flex items-center rounded-md border border-transparent bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                               onClick={() => requestRoleRemoval(m, r)}
                               aria-label={`Remove ${r} role from ${m.address}`}
                               title={`Remove ${r} role`}
                             >
                               {r} <span aria-hidden="true">✕</span>
                             </button>
                           ))}
                         </div>
                         {pendingAssignment?.address.toLowerCase() ===
                           m.address.toLowerCase() && (
                           <Badge variant="warning">Saving</Badge>
                         )}
                       </div>
                     </div>
                   ))}
                 </div>
                 
                 <div className="flex items-center justify-between border-t pt-4">
                    <div className="text-sm text-muted-foreground">
                      Page {currentPage} of {totalPages} ({filteredMembers.length} members)
                    </div>
                    <div className="flex items-center gap-2">
                       <Select
                          value={String(pageSize)}
                          onChange={(e) => setPageSize(Number(e.target.value))}
                       >
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

                 {isFetchingNextPage && (
                   <div className="text-center py-2 text-xs text-muted-foreground">
                     Loading more members…
                   </div>
                 )}
               </div>
             )}

          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  );
}
