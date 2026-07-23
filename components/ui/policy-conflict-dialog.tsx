/**
 * Policy Conflict Dialog Component
 * 
 * Displays when a policy update fails due to concurrent modification.
 * Offers the admin options to:
 * - Reload the latest version
 * - Force-overwrite with their changes
 * - Cancel and manually resolve
 */

import { AccessPolicy, MembershipTier, Role } from "@/lib/api/types";
import { Button } from "./button";
import { Badge } from "./badge";

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

function PolicySummary({ 
  policy, 
  label 
}: { 
  policy: AccessPolicy; 
  label: string;
}) {
  return (
    <div className="space-y-2 rounded-md border p-3 bg-muted/20">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Tier:</span>
          <Badge variant="outline">{policy.minTier ?? "free"}</Badge>
        </div>
        {policy.roles && policy.roles.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Roles:</span>
            {policy.roles.map((r) => (
              <Badge key={r} variant="default">
                {r}
              </Badge>
            ))}
          </div>
        )}
        {policy.updatedAt && (
          <div className="text-xs text-muted-foreground">
            Updated: {new Date(policy.updatedAt).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}

export function PolicyConflictDialog({
  attemptedPolicy,
  currentPolicy,
  onReload,
  onForceOverwrite,
  onCancel,
}: PolicyConflictDialogProps) {
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
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
            <PolicySummary 
              policy={attemptedPolicy} 
              label="Your Changes" 
            />
            
            {currentPolicy && (
              <PolicySummary 
                policy={currentPolicy} 
                label="Current Version (on server)" 
              />
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
