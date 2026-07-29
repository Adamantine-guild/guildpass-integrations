/**
 * Policy Conflict Dialog Component
 * 
 * Displays when a policy update fails due to concurrent modification.
 * Offers the admin options to:
 * - Reload the latest version
 * - Force-overwrite with their changes
 * - Cancel and manually resolve
 */

import { useRef } from "react";
import { AccessPolicy } from "@/lib/api/types";
import { Button } from "./button";
import { JsonDiff } from "./json-diff";
import { useFocusTrap } from "@/lib/hooks/use-focus-trap";

interface PolicyConflictDialogProps {
  /** The policy the user attempted to save */
  attemptedPolicy: AccessPolicy;
  /** The current policy loaded from the server (if available) */
  currentPolicy?: AccessPolicy;
  /** Callback when user chooses to reload the latest version */
  onReload: () => void;
  /** Callback when user chooses to force-overwrite with their changes */
  onForceOverwrite: () => void;
  /** Callback when user cancels */
  onCancel: () => void;
}



export function PolicyConflictDialog({
  attemptedPolicy,
  currentPolicy,
  onReload,
  onForceOverwrite,
  onCancel,
}: PolicyConflictDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, { isActive: true, onEscape: onCancel });

  return (
    <div 
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-dialog-title"
      aria-describedby="conflict-dialog-description"
    >
      <div className="w-full max-w-2xl rounded-lg border bg-card p-6 shadow-lg">
        <div className="space-y-4">
          <div>
            <h2 id="conflict-dialog-title" className="text-lg font-semibold">
              Policy Conflict Detected
            </h2>
            <p id="conflict-dialog-description" className="text-sm text-muted-foreground mt-1">
              This policy has been modified by another administrator since you started editing.
              Review the changes below and decide how to proceed.
            </p>
          </div>

          <div className="space-y-3">
            {currentPolicy && (
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  <strong>Server version updated at:</strong>{" "}
                  {currentPolicy.updatedAt ? new Date(currentPolicy.updatedAt).toLocaleString() : "Unknown"}
                </p>
                <p>
                  <strong>Your draft created at:</strong>{" "}
                  {attemptedPolicy.updatedAt ? new Date(attemptedPolicy.updatedAt).toLocaleString() : "Unknown"}
                </p>
              </div>
            )}
            
            {currentPolicy && (
              <div className="rounded-md border p-3 bg-card shadow-sm">
                <div className="mb-2 text-sm font-medium text-foreground">
                  Differences (Red = Server Version, Green = Your Attempted Changes)
                </div>
                <JsonDiff 
                  oldObj={{
                    ...currentPolicy,
                    updatedAt: undefined
                  }} 
                  newObj={{
                    ...attemptedPolicy,
                    updatedAt: undefined
                  }} 
                />
              </div>
            )}
            
            {!currentPolicy && (
              <div className="rounded-md border p-3 bg-card shadow-sm text-sm text-muted-foreground">
                Unable to load current server policy for comparison.
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="sm:order-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onReload}
              className="sm:order-2"
            >
              Reload Latest Version
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onForceOverwrite}
              className="sm:order-3"
            >
              Force Overwrite
            </Button>
          </div>

          <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3">
            <div className="flex gap-2">
              <span className="text-yellow-600 dark:text-yellow-400 font-medium text-sm">
                ⚠️ Warning:
              </span>
              <p className="text-xs text-muted-foreground">
                Force overwrite will discard the other administrator's changes permanently.
                Consider reloading to review their changes first.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
