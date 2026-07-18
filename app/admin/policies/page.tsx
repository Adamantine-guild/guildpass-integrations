"use client";

import { useId, useState, useMemo } from "react";
import { useAccount } from "wagmi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getApi,
  type AccessPolicy,
  type Resource,
  MembershipTier,
  Role,
} from "@/lib/api";
import { AuthError } from "@/lib/api/live";
import { FeatureGate } from "@/components/feature-gate";
import { features } from "@/lib/features";
import { applyOptimisticPolicy } from "@/lib/api/optimistic";
import { AdminGuard } from "@/components/admin-guard";
import { queryKeys } from "@/lib/query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  DeniedState,
  EmptyState,
  ErrorState,
  LoadingState,
  safeErrorMessage,
} from "@/components/ui/api-states";
import { useSiweAuth } from "@/lib/wallet/providers";
import {
  validatePolicy,
  type PolicyValidationErrors,
} from "@/lib/validation/policy";
const ALL_ROLES: Role[] = ["member", "moderator", "admin"];
const ALL_TIERS: MembershipTier[] = ["free", "standard", "pro"];

type PolicyRollback = {
  previousPolicies?: AccessPolicy[];
};

function ToggleRole({
  role,
  selected,
  onChange,
  disabled,
}: {
  role: Role;
  selected: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1 text-sm ${selected ? "border-primary bg-primary/10" : "border-input"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <input
        type="checkbox"
        className="h-3.5 w-3.5"
        checked={selected}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{role}</span>
    </label>
  );
}

function PolicyForm({
  resourceId,
  initial,
  onSave,
  onCancel,
  disabled,
}: {
  resourceId: string;
  initial?: AccessPolicy;
  onSave: (p: AccessPolicy) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const formId = useId();
  const resourceInputId = `${formId}-resource-id`;
  const tierSelectId = `${formId}-minimum-tier`;
  const rolesGroupId = `${formId}-required-roles`;
  const [resourceIdValue, setResourceIdValue] = useState(resourceId);
  const [minTier, setMinTier] = useState<MembershipTier | undefined>(
    initial?.minTier,
  );
  const [roles, setRoles] = useState<Role[]>(initial?.roles ?? []);
  const [errors, setErrors] = useState<PolicyValidationErrors>({});

  const toggleRole = (role: Role, selected: boolean) => {
    setRoles(selected ? [...roles, role] : roles.filter((r) => r !== role));
  };

  const handleSubmit = () => {
    const policy: AccessPolicy = {
      resourceId: resourceIdValue,
      minTier,
      roles: roles.length > 0 ? roles : undefined,
    };
    const result = validatePolicy(policy);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSave(result.value);
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor={resourceInputId}
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Resource ID
          </label>
          <Input
            id={resourceInputId}
            value={resourceIdValue}
            onChange={(e) => setResourceIdValue(e.target.value)}
            disabled={!!initial || disabled}
            placeholder="e.g. alpha, pro-reports"
            aria-invalid={errors.resourceId ? true : undefined}
            aria-describedby={
              errors.resourceId ? `${resourceInputId}-error` : undefined
            }
          />
          {errors.resourceId && (
            <p
              id={`${resourceInputId}-error`}
              className="mt-1 text-xs text-destructive"
              role="alert"
            >
              {errors.resourceId}
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor={tierSelectId}
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Minimum Tier
          </label>
          <Select
            id={tierSelectId}
            value={minTier ?? ""}
            onChange={(e) =>
              setMinTier(
                (e.target.value || undefined) as MembershipTier | undefined,
              )
            }
            disabled={disabled}
          >
            <option value="">— none —</option>
            {ALL_TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          {errors.minTier && (
            <p className="mt-1 text-xs text-destructive">{errors.minTier}</p>
          )}
        </div>
      </div>

      <div>
        <div
          id={rolesGroupId}
          className="mb-1 text-xs font-medium text-muted-foreground"
        >
          Required Roles
        </div>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-labelledby={rolesGroupId}
        >
          {ALL_ROLES.map((role) => (
            <ToggleRole
              key={role}
              role={role}
              selected={roles.includes(role)}
              onChange={(v) => toggleRole(role, v)}
              disabled={disabled}
            />
          ))}
        </div>
        {errors.roles && (
          <p className="mt-1 text-xs text-destructive">{errors.roles}</p>
        )}
      </div>

      {errors.combination && (
        <p className="text-xs text-destructive" role="alert">
          {errors.combination}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={disabled}
        >
          {initial ? "Update" : "Create"} Policy
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={disabled}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function SessionExpiredBanner() {
  const { signIn, isSigningIn } = useSiweAuth();

  return (
    <div id="session-expired-banner-policies">
      <DeniedState
        title="Admin session expired"
        message="Your admin session has expired."
        actions={
          <Button
            type="button"
            id="session-reauth-btn-policies"
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

export default function PoliciesPage() {
  const { address } = useAccount();
  const { authSession, markExpired, sessionStatus } = useSiweAuth();
  const qc = useQueryClient();

  const [pendingPolicyId, setPendingPolicyId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [rollbackMessage, setRollbackMessage] = useState("");
  const [formErrors, setFormErrors] = useState<
    Record<string, PolicyValidationErrors>
  >({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingResourceId, setEditingResourceId] = useState<string | null>(
    null,
  );

  const {
    data: policies,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<AccessPolicy[]>({
    queryKey: queryKeys.policies.all,
    queryFn: () => getApi(address).listPolicies(),
    retry: 1,
  });

  const { data: resources } = useQuery<Resource[]>({
    queryKey: queryKeys.resources.all,
    queryFn: () => getApi(address).listResources(),
    retry: 1,
  });

  const {
    mutate,
    isError: mutateError,
    error: mutateErrorValue,
    reset: resetMutation,
  } = useMutation<void, unknown, AccessPolicy, PolicyRollback>({
    mutationFn: (policy: AccessPolicy) =>
      getApi(address, authSession?.token).updatePolicy(policy),

    onMutate: async (policy) => {
      await qc.cancelQueries({ queryKey: queryKeys.policies.all });
      const previousPolicies = qc.getQueryData<AccessPolicy[]>(
        queryKeys.policies.all,
      );

      setPendingPolicyId(policy.resourceId);
      setSuccessMessage("");
      setRollbackMessage("");

      qc.setQueryData<AccessPolicy[]>(
        queryKeys.policies.all,
        (currentPolicies) => applyOptimisticPolicy(currentPolicies, policy),
      );

      return { previousPolicies };
    },

    onSuccess: (_data, policy) => {
      setSuccessMessage(`Policy saved for ${policy.resourceId}.`);
      setFormErrors((current) => ({
        ...current,
        [policy.resourceId]: {},
      }));
      setEditingResourceId(null);
      setShowCreateForm(false);
      resetMutation();
    },

    onError: (err: unknown, policy, context) => {
      qc.setQueryData(queryKeys.policies.all, context?.previousPolicies);
      setRollbackMessage(`Change reverted: ${safeErrorMessage(err)}`);

      if (err instanceof AuthError) {
        markExpired();
      }

      if (policy?.resourceId) {
        const result = validatePolicy(policy);
        if (!result.valid) {
          setFormErrors((current) => ({
            ...current,
            [policy.resourceId]: result.errors,
          }));
        }
      }
    },

    onSettled: () => {
      setPendingPolicyId(null);
      qc.invalidateQueries({ queryKey: queryKeys.policies.all });
    },
  });

  const savePolicy = (policy: AccessPolicy) => {
    const result = validatePolicy(policy);

    if (!result.valid) {
      setFormErrors((current) => ({
        ...current,
        [policy.resourceId]: result.errors,
      }));
      setSuccessMessage("");
      return;
    }

    setFormErrors((current) => ({
      ...current,
      [policy.resourceId]: {},
    }));

    mutate(result.value);
  };

  const resourcesById = useMemo(() => {
    const map = new Map<string, Resource>();
    resources?.forEach((r) => map.set(r.id, r));
    return map;
  }, [resources]);

  return (
    <FeatureGate enabled={features.adminPolicies} name="Access Policies">
      <AdminGuard>
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-semibold">Access Policies</h1>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setShowCreateForm(!showCreateForm);
                setEditingResourceId(null);
              }}
            >
              {showCreateForm ? "Close" : "+ New Policy"}
            </Button>
          </div>

          {sessionStatus === "expired" && <SessionExpiredBanner />}

          {showCreateForm && (
            <Card>
              <CardHeader>
                <CardTitle>Create New Policy</CardTitle>
              </CardHeader>
              <CardContent>
                <PolicyForm
                  resourceId=""
                  onSave={savePolicy}
                  onCancel={() => setShowCreateForm(false)}
                  disabled={Boolean(pendingPolicyId)}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Resources & Policies</CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {isLoading ? (
                <LoadingState message="Loading resources…" />
              ) : isError ? (
                <ErrorState
                  title="Failed to load policies"
                  message={safeErrorMessage(error)}
                  onRetry={() => refetch()}
                />
              ) : !policies?.length && !resources?.length ? (
                <EmptyState
                  title="No resources configured"
                  message="No access policies have been configured yet. Create one above to get started."
                />
              ) : (
                <>
                  {/* Show resources with their policies */}
                  {(resources ?? []).map((resource) => {
                    const resourcePolicies =
                      policies?.filter((p) => p.resourceId === resource.id) ??
                      [];
                    const isEditing = editingResourceId === resource.id;

                    return (
                      <div
                        key={resource.id}
                        className="space-y-2 rounded-md border p-3"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-sm">
                                {resource.title || resource.id}
                              </span>
                              {resourcePolicies.length > 0 && (
                                <Badge variant="default">
                                  {resourcePolicies.length} policy
                                  {resourcePolicies.length > 1 ? "s" : ""}
                                </Badge>
                              )}
                            </div>
                            {resource.description && (
                              <p className="text-xs text-muted-foreground">
                                {resource.description}
                              </p>
                            )}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingResourceId(
                                isEditing ? null : resource.id,
                              );
                              setShowCreateForm(false);
                            }}
                            disabled={Boolean(pendingPolicyId)}
                          >
                            {isEditing ? "Close" : "Edit"}
                          </Button>
                        </div>

                        {/* Existing policies for this resource */}
                        {resourcePolicies.length > 0 && (
                          <div className="space-y-2 pl-3 border-l-2 border-muted">
                            {resourcePolicies.map((policy) => {
                              const errors = formErrors[policy.resourceId];
                              return (
                                <div
                                  key={policy.resourceId}
                                  className="space-y-1"
                                >
                                  <div className="flex flex-wrap items-center gap-2 text-sm">
                                    <span className="text-muted-foreground">
                                      Tier:
                                    </span>
                                    <Badge variant="outline">
                                      {policy.minTier ?? "free"}
                                    </Badge>
                                    {policy.roles &&
                                      policy.roles.length > 0 && (
                                        <>
                                          <span className="text-muted-foreground">
                                            Roles:
                                          </span>
                                          {policy.roles.map((r) => (
                                            <Badge key={r} variant="default">
                                              {r}
                                            </Badge>
                                          ))}
                                        </>
                                      )}
                                    {pendingPolicyId === policy.resourceId && (
                                      <Badge variant="warning">Saving</Badge>
                                    )}
                                  </div>

                                  {errors && Object.keys(errors).length > 0 && (
                                    <div
                                      className="text-xs text-destructive"
                                      role="alert"
                                    >
                                      {Object.values(errors)
                                        .filter(Boolean)
                                        .map((msg) => (
                                          <span key={msg} className="block">
                                            {msg}
                                          </span>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Inline edit form */}
                        {isEditing && (
                          <div className="pt-2">
                            <PolicyForm
                              resourceId={resource.id}
                              initial={resourcePolicies[0]}
                              onSave={savePolicy}
                              onCancel={() => setEditingResourceId(null)}
                              disabled={Boolean(pendingPolicyId)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Show policies that don't match any resource (orphaned) */}
                  {policies &&
                    policies.length > 0 &&
                    resources &&
                    resources.length > 0 &&
                    (() => {
                      const resourceIds = new Set(resources.map((r) => r.id));
                      const orphaned = policies.filter(
                        (p) => !resourceIds.has(p.resourceId),
                      );
                      if (orphaned.length === 0) return null;
                      return (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Unassigned Policies
                          </p>
                          {orphaned.map((policy) => {
                            const errors = formErrors[policy.resourceId];
                            return (
                              <div
                                key={policy.resourceId}
                                className="rounded-md border p-3 space-y-1"
                              >
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="font-mono text-xs">
                                    {policy.resourceId}
                                  </span>
                                  <Badge variant="outline">
                                    {policy.minTier ?? "free"}
                                  </Badge>
                                  {policy.roles &&
                                    policy.roles.length > 0 &&
                                    policy.roles.map((r) => (
                                      <Badge key={r} variant="default">
                                        {r}
                                      </Badge>
                                    ))}
                                  {pendingPolicyId === policy.resourceId && (
                                    <Badge variant="warning">Saving</Badge>
                                  )}
                                </div>
                                {errors && Object.keys(errors).length > 0 && (
                                  <div
                                    className="text-xs text-destructive"
                                    role="alert"
                                  >
                                    {Object.values(errors)
                                      .filter(Boolean)
                                      .map((msg) => (
                                        <span key={msg} className="block">
                                          {msg}
                                        </span>
                                      ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                </>
              )}

              {successMessage && (
                <div
                  className="text-sm text-green-700 dark:text-green-400"
                  role="status"
                >
                  {successMessage}
                </div>
              )}

              {rollbackMessage && (
                <div className="text-sm text-destructive" role="alert">
                  {rollbackMessage}
                </div>
              )}

              {mutateError && (
                <ErrorState
                  title="Failed to save policy"
                  message={safeErrorMessage(mutateErrorValue)}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </AdminGuard>
    </FeatureGate>
  );
}
