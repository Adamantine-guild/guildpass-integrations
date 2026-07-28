"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApi, PendingAction } from "@/lib/api";
import { queryKeys } from "@/lib/query";
import { useParams } from "next/navigation";
import { AdminGuard } from "@/components/admin-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToasts, ToastViewport } from "@/components/ui/toast";
import { useSiweAuth } from "@/lib/wallet/providers";
import { AddressText } from "@/components/wallet/address-text";

export default function ApprovalsPage() {
  const params = useParams();
  const communitySlug = (params?.communitySlug as string) || 'guildpass-demo';
  const queryClient = useQueryClient();
  const { addToast } = useToasts();
  const { authSession } = useSiweAuth();
  const currentAddress = authSession?.address;

  const { data: pendingActions, isLoading } = useQuery({
    queryKey: queryKeys.pendingActions.all(communitySlug),
    queryFn: () => getApi(authSession?.token, undefined, communitySlug).getPendingActions(),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => getApi(authSession?.token, undefined, communitySlug).approveAction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingActions.all(communitySlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all(communitySlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.policies.all(communitySlug) });
      addToast({ title: "Approved", description: "Action approved successfully.", variant: "success" });
    },
    onError: (error: any) => {
      addToast({ title: "Error", description: error.message || "Failed to approve action.", variant: "destructive" });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => getApi(authSession?.token, undefined, communitySlug).rejectAction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingActions.all(communitySlug) });
      addToast({ title: "Rejected", description: "Action rejected successfully.", variant: "default" });
    },
    onError: (error: any) => {
      addToast({ title: "Error", description: error.message || "Failed to reject action.", variant: "destructive" });
    }
  });

  // Sort so pending actions are at the top
  const sortedActions = pendingActions ? [...pendingActions].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }) : [];

  return (
    <AdminGuard>
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Pending Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Review and approve sensitive administrative actions proposed by other admins.
        </p>

        {isLoading ? (
          <div>Loading pending actions...</div>
        ) : sortedActions.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No pending actions require approval.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {sortedActions.map((action: PendingAction) => {
              // Note: using toLowerCase() for address comparisons as a best practice for Ethereum addresses
              const currentAddressLower = currentAddress?.toLowerCase();
              const canApprove = currentAddressLower && 
                !action.currentApprovals.map(a => a.toLowerCase()).includes(currentAddressLower) && 
                action.status === 'pending';
              const isProposer = currentAddressLower && action.proposer.toLowerCase() === currentAddressLower;

              return (
                <Card key={action.id}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-lg">
                      {action.type === 'assignRole' && 'Assign Role'}
                      {action.type === 'removeRole' && 'Remove Role'}
                      {action.type === 'updatePolicy' && 'Update Policy'}
                    </CardTitle>
                    <Badge variant={action.status === 'pending' ? 'outline' : action.status === 'executed' ? 'default' : 'destructive'}>
                      {action.status.toUpperCase()}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Proposer:</span>
                        <AddressText address={action.proposer} />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Approvals:</span>
                        <span>{action.currentApprovals.length} / {action.requiredApprovals}</span>
                      </div>
                      
                      <div className="mt-4 rounded-md bg-muted p-3">
                        <pre className="text-xs overflow-x-auto">
                          {JSON.stringify(action.payload, null, 2)}
                        </pre>
                      </div>

                      {action.status === 'pending' && (
                        <div className="mt-4 flex gap-2 justify-end">
                          <Button 
                            variant="outline" 
                            disabled={!canApprove || rejectMutation.isPending} 
                            onClick={() => rejectMutation.mutate(action.id)}
                          >
                            Reject
                          </Button>
                          <Button 
                            disabled={!canApprove || approveMutation.isPending} 
                            onClick={() => approveMutation.mutate(action.id)}
                          >
                            Approve
                          </Button>
                        </div>
                      )}
                      
                      {action.status === 'pending' && isProposer && !canApprove && (
                        <p className="text-xs text-right text-muted-foreground mt-2">
                          Waiting for other admins to approve.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      <ToastViewport />
    </AdminGuard>
  );
}
