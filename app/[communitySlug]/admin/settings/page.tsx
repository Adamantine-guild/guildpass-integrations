"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { AdminGuard } from "@/components/admin-guard";
import { FeatureGate } from "@/components/feature-gate";
import { features } from "@/lib/features";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApi, ApprovalConfig } from "@/lib/api";
import { queryKeys } from "@/lib/query";
import { useToasts, ToastViewport } from "@/components/ui/toast";

export default function SettingsPage() {
  const params = useParams();
  const communitySlug = (params?.communitySlug as string) || 'guildpass-demo';

  const { data: community } = useQuery({
    queryKey: queryKeys.community.all(communitySlug),
    queryFn: () => getApi(undefined, undefined, communitySlug).getCommunity(),
  });

  const queryClient = useQueryClient();
  const { toasts, addToast, dismissToast } = useToasts();
  const [name, setName] = useState("");
  const [approvalConfig, setApprovalConfig] = useState<ApprovalConfig>({ assignRole: 1, removeRole: 1, updatePolicy: 1 });

  const updateConfigMutation = useMutation({
    mutationFn: (config: ApprovalConfig) => getApi(undefined, undefined, communitySlug).updateApprovalConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.community.all(communitySlug) });
      addToast({ title: "Configuration saved", description: "Approval thresholds have been updated.", tone: "success" });
    },
    onError: () => {
      addToast({ title: "Error", description: "Failed to update configuration.", tone: "error" });
    }
  });

  useEffect(() => {
    if (community?.name) {
      setName(community.name);
    }
    if (community?.approvalConfig) {
      setApprovalConfig(community.approvalConfig);
    }
  }, [community?.name, community?.approvalConfig]);

  return (
    <FeatureGate enabled={features.adminSettings} name="Community Settings">
      <AdminGuard>
        <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Community Settings</h1>
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <label htmlFor="community-name" className="text-sm font-medium">
              Community Name
            </label>
            <Input
              id="community-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled>Save</Button>
              <span className="text-xs text-muted-foreground">
                Persistence deferred for MVP.
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Workflow & Approvals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground mb-4">
              Configure the number of admin approvals required before sensitive actions take effect. (1 = instant execution)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Assign Role</label>
                <Input
                  type="number"
                  min="1"
                  max="5"
                  value={approvalConfig.assignRole}
                  onChange={(e) => setApprovalConfig({ ...approvalConfig, assignRole: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Remove Role</label>
                <Input
                  type="number"
                  min="1"
                  max="5"
                  value={approvalConfig.removeRole}
                  onChange={(e) => setApprovalConfig({ ...approvalConfig, removeRole: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Update Policy</label>
                <Input
                  type="number"
                  min="1"
                  max="5"
                  value={approvalConfig.updatePolicy}
                  onChange={(e) => setApprovalConfig({ ...approvalConfig, updatePolicy: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>
            <div className="pt-2">
              <Button onClick={() => updateConfigMutation.mutate(approvalConfig)} disabled={updateConfigMutation.isPending}>
                {updateConfigMutation.isPending ? "Saving..." : "Save Approvals"}
              </Button>
            </div>
          </CardContent>
        </Card>
        </div>
        <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      </AdminGuard>
    </FeatureGate>
  );
}
