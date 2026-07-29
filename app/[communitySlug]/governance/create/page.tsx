'use client';

import { useParams, useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getApi } from '@/lib/api';
import { FeatureGate } from '@/components/feature-gate';
import { features } from '@/lib/features';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSiweAuth } from '@/lib/wallet/providers';
import { ProposalType } from '@/lib/api/types';
import { useState } from 'react';
import { isApiError, safeErrorMessage } from '@/lib/api/errors';

export default function CreateProposalPage() {
  const params = useParams() as { communitySlug?: string };
  const communitySlug = params.communitySlug || 'guildpass-demo';
  const router = useRouter();
  const { address } = useAccount();
  const { session } = useSiweAuth();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    type: 'policy_change' as ProposalType,
    title: '',
    description: '',
    votingStartsAt: new Date().toISOString().split('T')[0],
    votingEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });

  const [error, setError] = useState<string | null>(null);

  const createProposalMutation = useMutation({
    mutationFn: () =>
      getApi(address, session?.token, communitySlug).createProposal({
        type: formData.type as ProposalType,
        title: formData.title,
        description: formData.description,
        proposer: address!,
        votingStartsAt: new Date(formData.votingStartsAt).toISOString(),
        votingEndsAt: new Date(formData.votingEndsAt).toISOString(),
        payload: {},
      }),
    onSuccess: (proposal) => {
      queryClient.invalidateQueries({ queryKey: ['governance'] });
      router.push(`/${communitySlug}/governance/${proposal.id}`);
    },
    onError: (err) => {
      setError(safeErrorMessage(err));
    },
  });

  const isAdmin = session?.roles?.includes('admin') ?? false;

  if (!address) {
    return (
      <FeatureGate enabled={features.governance} name="Governance">
        <div className="p-8 text-center">
          <p className="text-muted-foreground mb-6">Please connect your wallet.</p>
        </div>
      </FeatureGate>
    );
  }

  if (!isAdmin) {
    return (
      <FeatureGate enabled={features.governance} name="Governance">
        <div className="p-8 text-center">
          <p className="text-muted-foreground mb-6">Only admins can create proposals.</p>
        </div>
      </FeatureGate>
    );
  }

  return (
    <FeatureGate enabled={features.governance} name="Governance">
      <div className="max-w-2xl mx-auto space-y-6">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="mb-4"
        >
          ← Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Create Proposal</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createProposalMutation.mutate();
              }}
              className="space-y-6"
            >
              {/* Type */}
              <div>
                <label className="block text-sm font-medium mb-2">Proposal Type</label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value as ProposalType })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="policy_change">Policy Change</option>
                  <option value="resource_addition">Resource Addition</option>
                  <option value="rule_update">Rule Update</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium mb-2">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Lower Pro tier pricing"
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe the proposal in detail..."
                  rows={5}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </div>

              {/* Voting Dates */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-2">Voting Starts</label>
                  <input
                    type="date"
                    value={formData.votingStartsAt}
                    onChange={(e) => setFormData({ ...formData, votingStartsAt: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Voting Ends</label>
                  <input
                    type="date"
                    value={formData.votingEndsAt}
                    onChange={(e) => setFormData({ ...formData, votingEndsAt: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={createProposalMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createProposalMutation.isPending}
                >
                  {createProposalMutation.isPending ? 'Creating...' : 'Create Proposal'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </FeatureGate>
  );
}
