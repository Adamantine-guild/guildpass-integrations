"use client";

import { useAccount } from "wagmi";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApi, type MemberRow, type Role } from "@/lib/api";
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
import {
  applyOptimisticRole,
  applyOptimisticRemoveRole,
} from "@/lib/api/optimistic";
import { roleRemovalConfirmationMessage } from "@/lib/api/role-removal";
import { AddressText } from "@/components/wallet/address-text";
import { isWalletAddress, normalizeAddress } from "@/lib/wallet/address";
import type { BulkResult } from "@/components/ui/bulk-action-toolbar";
import { MemberList } from "@/components/admin/member-list";
import { Users } from "lucide-react";
import { features } from "@/lib/features";

type AssignRoleInput = {
  address: string;
  role: Role;
};

type AssignRoleRollback = {
  previousMembers?: MemberRow[];
};

type AuditLogEntry = {
  id: string;
  address: string;
  role: Role;
  action: "assign" | "remove";
  status: "pending" | "success" | "error";
  timestamp: Date;
  error?: string;
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
  const { authSession, markExpired, sessionStatus, registerPendingRetry } = useSiweAuth();
  const qc = useQueryClient();
  const { toasts, addToast, dismissToast } = useToasts();
  const params = useParams();
  const communitySlug = (params?.communitySlug as string) || 'guildpass-demo';

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
    queryKey: queryKeys.members.all(communitySlug),
    queryFn: async ({ pageParam }) => {
      const api = getApi(address, authSession?.token, communitySlug);
      const limit = 100;
      // Search/role/tier filtering happens entirely client-side (see
      // components/admin/member-list.tsx) — this fetch is purely
      // cursor-driven and never re-runs in response to filter changes.
      const res = await api.listMembers({
        cursor: pageParam,
        limit,
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
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
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

  const hasAnyMembers = allFetchedMembers.length > 0

  const {
    mutate,
    isPending,
    isError: mutateError,
    error: mutateErrorValue,
    reset: resetMutation,
  } = useMutation<{ status: 'executed' | 'pending'; pendingActionId?: string }, unknown, AssignRoleInput, { previousQueries?: [any, any][]; auditId: string }>({
    mutationFn: (input) =>
      getApi(address, authSession?.token, communitySlug).assignRole(input.address, input.role),
    // Auth errors are handled via registerPendingRetry — do not auto-retry 401s
    // to avoid racing with the re-auth banner flow.
    retry: false,
    onMutate: async (input) => {
      const auditId = Date.now().toString() + Math.random().toString();
      setAuditLog((prev) => [
        {
          id: auditId,
          address: input.address,
          role: input.role,
          action: "assign",
          status: "pending",
          timestamp: new Date(),
        },
        ...prev,
      ]);

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

      return { previousQueries, auditId };
    },
    onSuccess: (data, input, context) => {
      if (data.status === 'pending') {
        // Rollback optimistic update
        if (context?.previousQueries) {
          for (const [key, qData] of context.previousQueries) {
            qc.setQueryData(key, qData);
          }
        }
        setPendingAssignment(null);
        addToast({
          tone: "warning",
          title: "Approval Required",
          description: `Assignment of ${input.role} to ${input.address.slice(0, 6)}…${input.address.slice(-4)} has been proposed for approval.`,
        });
        setAddr("");
        resetMutation();
        return;
      }

      setAuditLog((prev) =>
        prev.map((entry) =>
          entry.id === context?.auditId ? { ...entry, status: "success" } : entry
        )
      );
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
        ? "Session expired. Re-authenticating and retrying role assignment…"
        : safeErrorMessage(err);

      if (context?.auditId) {
        setAuditLog((prev) =>
          prev.map((entry) =>
            entry.id === context.auditId
              ? { ...entry, status: "error", error: message }
              : entry
          )
        );
      }

      setRollbackMessage(`Change reverted: ${safeErrorMessage(err)}`);
      addToast({
        tone: isExpiredSession ? "warning" : "error",
        title: isExpiredSession ? "Session expired — retrying after re-auth" : "Failed to assign role",
        description: message,
      });

      if (isExpiredSession) {
        // Capture the input so the mutation can be replayed once re-auth succeeds.
        const capturedInput = _input;
        registerPendingRetry(
          async (freshSession) => {
            await getApi(address, freshSession.token, communitySlug).assignRole(
              capturedInput.address,
              capturedInput.role,
            );
            // Reconcile cache and notify success
            reconcileMemberRoleCache(
              qc,
              { address: capturedInput.address, role: capturedInput.role, action: "assign" },
              communitySlug,
            );
            setSuccessAssignment(capturedInput);
            setRollbackMessage("");
            addToast({
              tone: "success",
              title: `Role assigned to ${capturedInput.address.slice(0, 6)}…${capturedInput.address.slice(-4)}`,
              description: `The ${capturedInput.role} role was assigned successfully after re-authentication.`,
            });
          },
          {
            onRetryFailure: (retryErr) => {
              setRollbackMessage(`Retry failed: ${safeErrorMessage(retryErr)}`);
              addToast({
                tone: "error",
                title: "Role assignment failed after re-auth",
                description: safeErrorMessage(retryErr),
              });
            },
          },
        );
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
    { status: 'executed' | 'pending'; pendingActionId?: string },
    unknown,
    AssignRoleInput,
    { previousQueries?: [any, any][]; auditId: string }
  >({
    mutationFn: (input) =>
      getApi(address, authSession?.token, communitySlug).removeRole(input.address, input.role),
    // Auth errors are handled via registerPendingRetry — do not auto-retry 401s.
    retry: false,
    onMutate: async (input) => {
      const auditId = Date.now().toString() + Math.random().toString();
      setAuditLog((prev) => [
        {
          id: auditId,
          address: input.address,
          role: input.role,
          action: "remove",
          status: "pending",
          timestamp: new Date(),
        },
        ...prev,
      ]);

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
      return { previousQueries, auditId };
    },
    onSuccess: (data, input, context) => {
      if (data.status === 'pending') {
        // Rollback optimistic update
        if (context?.previousQueries) {
          for (const [key, qData] of context.previousQueries) {
            qc.setQueryData(key, qData);
          }
        }
        setPendingAssignment(null);
        addToast({
          tone: "warning",
          title: "Approval Required",
          description: `Removal of ${input.role} from ${input.address.slice(0, 6)}…${input.address.slice(-4)} has been proposed for approval.`,
        });
        resetMutation();
        return;
      }

      setAuditLog((prev) =>
        prev.map((entry) =>
          entry.id === context?.auditId ? { ...entry, status: "success" } : entry
        )
      );
      reconcileMemberRoleCache(qc, {
        address: input.address,
        role: input.role,
        action: "remove",
      }, communitySlug);
      setSuccessMessage(`Role "${input.role}" removed from ${input.address}.`);
      addToast({
        tone: "success",
        title: `Role removed from ${input.address.slice(0, 6)}…${input.address.slice(-4)}`,
        description: `The ${input.role} role was removed successfully.`,
      });
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
        ? "Session expired. Re-authenticating and retrying role removal…"
        : safeErrorMessage(err);

      if (context?.auditId) {
        setAuditLog((prev) =>
          prev.map((entry) =>
            entry.id === context.auditId
              ? { ...entry, status: "error", error: message }
              : entry
          )
        );
      }

      setRollbackMessage(`Change reverted: ${safeErrorMessage(err)}`);
      addToast({
        tone: isExpiredSession ? "warning" : "error",
        title: isExpiredSession ? "Session expired — retrying after re-auth" : "Failed to remove role",
        description: message,
      });

      if (isExpiredSession) {
        const capturedInput = _input;
        registerPendingRetry(
          async (freshSession) => {
            await getApi(address, freshSession.token, communitySlug).removeRole(
              capturedInput.address,
              capturedInput.role,
            );
            reconcileMemberRoleCache(
              qc,
              { address: capturedInput.address, role: capturedInput.role, action: "remove" },
              communitySlug,
            );
            setSuccessMessage(`Role "${capturedInput.role}" removed from ${capturedInput.address}.`);
            setRollbackMessage("");
            addToast({
              tone: "success",
              title: `Role removed from ${capturedInput.address.slice(0, 6)}…${capturedInput.address.slice(-4)}`,
              description: `The ${capturedInput.role} role was removed successfully after re-authentication.`,
            });
          },
          {
            onRetryFailure: (retryErr) => {
              setRollbackMessage(`Retry failed: ${safeErrorMessage(retryErr)}`);
              addToast({
                tone: "error",
                title: "Role removal failed after re-auth",
                description: safeErrorMessage(retryErr),
              });
            },
          },
        );
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

        {auditLog.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Recent Role Changes (This Session)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {auditLog.map((log) => (
                  <div key={log.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0 last:pb-0">
                    <div>
                      <span className="font-medium"><AddressText address={log.address} /></span>
                      <span className="text-muted-foreground mx-2">
                        {log.action === 'assign' ? 'assigned' : 'removed'} role
                      </span>
                      <Badge variant="outline">{log.role}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {log.timestamp.toLocaleTimeString()}
                      </span>
                      {log.status === 'pending' && <Badge variant="outline">Pending</Badge>}
                      {log.status === 'success' && <Badge className="bg-green-600 hover:bg-green-700">Success</Badge>}
                      {log.status === 'error' && (
                        <Badge variant="destructive" title={log.error}>Failed</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
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
            ) : (
              <>
                <MemberList
                  members={allFetchedMembers}
                  showProfileLink={features.profiles}
                  pendingAddress={pendingAssignment?.address.toLowerCase()}
                  onRequestRoleRemoval={requestRoleRemoval}
                  selectedAddresses={selectedAddresses}
                  onToggleSelect={toggleSelect}
                  bulkRole={bulkRole}
                  onBulkRoleChange={setBulkRole}
                  onBulkAssign={handleBulkAssign}
                  onClearSelection={clearSelection}
                  onRetryFailedBulk={handleRetryFailed}
                  isBulkPending={isBulkPending}
                  bulkResults={bulkResults}
                />
                {isFetchingNextPage && (
                  <div className="text-center py-2 text-xs text-muted-foreground">
                    Loading more members…
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  );
}
