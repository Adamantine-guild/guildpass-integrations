"use client";

/**
 * components/offline/mutation-queue-sync.tsx
 *
 * Always-mounted (see app/layout.tsx) engine that replays
 * lib/offline/mutation-queue.ts against the live API whenever the app comes
 * back online, one mutation at a time, FIFO.
 *
 * This lives above both admin pages — rather than inside either — because
 * the queue can hold a mix of assignRole/removeRole (queued from the
 * Members page) and updatePolicy (queued from the Policies page)
 * mutations, and FIFO order must be preserved across that mix regardless
 * of which admin page (if any) happens to be mounted when the app
 * reconnects; a page-scoped drain loop could only ever replay its own
 * mutation types.
 *
 * Renders nothing in the common case; only mounts PolicyConflictDialog when
 * a replayed updatePolicy hits a 409 — reusing the exact same dialog
 * component and conflict-context helper
 * (lib/api/policy-conflict.ts) the live Policies page uses for a live
 * conflict, so the resolution UX is identical either way.
 */

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { getApi } from "@/lib/api";
import type { AccessPolicy } from "@/lib/api/types";
import { useSiweAuth } from "@/lib/wallet/providers";
import { useSyncStatus } from "@/lib/offline/use-sync-status";
import {
  drainMutationQueue,
  type MutationReplayApi,
  type ReplayOutcome,
} from "@/lib/offline/mutation-replay";
import { mutationQueue, type QueuedMutation } from "@/lib/offline/mutation-queue";
import type { PolicyConflictContext } from "@/lib/api/policy-conflict";
import { queryKeys, reconcileMemberRoleCache } from "@/lib/query";
import { PolicyConflictDialog } from "@/components/ui/policy-conflict-dialog";

interface ConflictState {
  mutation: QueuedMutation;
  context: PolicyConflictContext;
}

export function MutationQueueSync() {
  const { address } = useAccount();
  const { authSession } = useSiweAuth();
  const { isOnline } = useSyncStatus();
  const qc = useQueryClient();

  const [conflict, setConflict] = useState<ConflictState | null>(null);

  const resolveApi = useCallback(
    (communitySlug: string): MutationReplayApi =>
      getApi(address, authSession?.token, communitySlug),
    [address, authSession?.token],
  );

  const runDrain = useCallback(async () => {
    const outcome: ReplayOutcome = await drainMutationQueue(resolveApi, {
      onMutationSucceeded: (mutation) => {
        if (mutation.type === "updatePolicy") {
          void qc.invalidateQueries({
            queryKey: queryKeys.policies.all(mutation.communitySlug),
          });
          return;
        }
        reconcileMemberRoleCache(
          qc,
          {
            address: mutation.payload.address,
            role: mutation.payload.role,
            action: mutation.type === "assignRole" ? "assign" : "remove",
          },
          mutation.communitySlug,
        );
      },
    });

    if (outcome.kind === "conflict") {
      setConflict({ mutation: outcome.mutation, context: outcome.context });
    }
    // 'drained' / 'blocked' / 'skipped' need no UI here — 'blocked' just
    // waits for the next reconnect (or token refresh) to try again; the
    // pending count on SyncStatusBanner already reflects the outstanding
    // item either way.
  }, [resolveApi, qc]);

  // Replay on reconnect, and on mount if already online (e.g. the queue was
  // populated in a previous session and the page just (re)loaded online).
  // Also re-attempt whenever the SIWE token changes — a mutation blocked on
  // an expired session (401, not a network error) should resume once the
  // admin re-authenticates, without waiting for another connectivity flip.
  useEffect(() => {
    if (!isOnline) return;
    void runDrain();
  }, [isOnline, authSession?.token, runDrain]);

  if (!conflict) return null;

  const { mutation, context } = conflict;

  // Reload: give up the queued edit and show what's actually on the
  // server — matches the live dialog's "Reload Latest Version" intent.
  const handleReload = () => {
    void (async () => {
      await mutationQueue.remove(mutation.id);
      void qc.invalidateQueries({ queryKey: queryKeys.policies.all(mutation.communitySlug) });
      setConflict(null);
      void runDrain();
    })();
  };

  // Force overwrite: replay the same policy without its `updatedAt` version
  // token, bypassing the concurrency check — identical trick to the live
  // dialog's force-overwrite path.
  const handleForceOverwrite = () => {
    void (async () => {
      const { updatedAt, ...policyWithoutVersion } = context.attemptedPolicy;
      try {
        await resolveApi(mutation.communitySlug).updatePolicy(
          policyWithoutVersion as AccessPolicy,
        );
        await mutationQueue.remove(mutation.id);
        void qc.invalidateQueries({ queryKey: queryKeys.policies.all(mutation.communitySlug) });
      } catch {
        // Still couldn't save (offline again, another conflict, etc.) —
        // leave it queued; the next drain attempt will surface a fresh
        // conflict (or succeed) rather than losing the admin's change.
        await mutationQueue.incrementRetryCount(mutation.id);
      }
      setConflict(null);
      void runDrain();
    })();
  };

  // Cancel: dismiss without forcing a refetch — the admin can decide what
  // to do next, same as closing the live dialog leaves the form untouched.
  const handleCancel = () => {
    void (async () => {
      await mutationQueue.remove(mutation.id);
      setConflict(null);
      void runDrain();
    })();
  };

  return (
    <PolicyConflictDialog
      attemptedPolicy={context.attemptedPolicy}
      currentPolicy={context.currentPolicy}
      onReload={handleReload}
      onForceOverwrite={handleForceOverwrite}
      onCancel={handleCancel}
    />
  );
}
