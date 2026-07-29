'use client';

import { useParams, useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApi } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { FeatureGate } from '@/components/feature-gate';
import { features } from '@/lib/features';
import { LoadingState, ErrorState, EmptyState, safeErrorMessage } from '@/components/ui/api-states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ProposalStatusBadge } from '../proposal-status-badge';
import { useSiweAuth } from '@/lib/wallet/providers';
import { VoteChoice } from '@/lib/api/types';
import { useState } from 'react';

export default function ProposalDetailPage() {
  const params = useParams() as { communitySlug?: string; proposalId: string };
  const communitySlug = params.communitySlug || 'guildpass-demo';
  const proposalId = params.proposalId;
  const router = useRouter();
  const { address } = useAccount();
  const { session } = useSiweAuth();
  const queryClient = useQueryClient();
  const [selectedVote, setSelectedVote] = useState<VoteChoice | null>(null);

  const isAdmin = session?.roles?.includes('admin') ?? false;

  const {
    data: proposal,
    isLoading: proposalLoading,
    error: proposalError,
    refetch: refetchProposal,
  } = useQuery({
    queryKey: queryKeys.governance.detail(proposalId),
    queryFn: () => getApi(address, session?.token, communitySlug).getProposal(proposalId),
    enabled: !!address && !!proposalId,
  });

  const { data: memberVote } = useQuery({
    queryKey: queryKeys.governance.memberVote(proposalId),
    queryFn: () => getApi(address, session?.token, communitySlug).getMemberVote(proposalId),
    enabled: !!address && !!proposalId && proposal?.status === 'active',
  });

  const { data: allVotes = [] } = useQuery({
    queryKey: queryKeys.governance.votes(proposalId),
    queryFn: () => getApi(address, session?.token, communitySlug).listProposalVotes(proposalId),
    enabled: !!address && !!proposalId,
  });

  const castVoteMutation = useMutation({
    mutationFn: (choice: VoteChoice) =>
      getApi(address, session?.token, communitySlug).castVote(proposalId, choice),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.governance.memberVote(proposalId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.governance.detail(proposalId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.governance.votes(proposalId) });
    },
  });

  const closeVotingMutation = useMutation({
    mutationFn: () =>
      getApi(address, session?.token, communitySlug).closeProposalVoting(proposalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.governance.detail(proposalId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.governance.list(communitySlug) });
    },
  });

  if (!address) {
    return (
      <FeatureGate enabled={features.governance} name="Governance">
        <div className="p-8 text-center">
          <p className="text-muted-foreground mb-6">Please connect your wallet to view proposals.</p>
        </div>
      </FeatureGate>
    );
  }

  if (proposalLoading) {
    return (
      <FeatureGate enabled={features.governance} name="Governance">
        <LoadingState message="Loading proposal…" />
      </FeatureGate>
    );
  }

  if (proposalError || !proposal) {
    return (
      <FeatureGate enabled={features.governance} name="Governance">
        <ErrorState
          title="Could not load proposal"
          message={safeErrorMessage(proposalError) || 'Proposal not found.'}
          onRetry={() => refetchProposal()}
        />
      </FeatureGate>
    );
  }

  const canVote = proposal.status === 'active' && !memberVote;
  const hasVoted = !!memberVote;

  return (
    <FeatureGate enabled={features.governance} name="Governance">
      <div className="space-y-6">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="mb-4"
        >
          ← Back
        </Button>

        {/* Proposal Header */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-3">
                  <h1 className="text-3xl font-bold">{proposal.title}</h1>
                  <ProposalStatusBadge status={proposal.status} />
                </div>
                <p className="text-muted-foreground text-lg">{proposal.description}</p>
                <div className="mt-4 text-sm text-muted-foreground">
                  <p>Type: <span className="font-medium">{proposal.type}</span></p>
                  <p>Proposer: <span className="font-mono">{proposal.proposer.slice(0, 10)}...</span></p>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Proposal Details */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Voting Period</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <p className="text-muted-foreground">Starts</p>
                <p className="font-medium">{new Date(proposal.votingStartsAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Ends</p>
                <p className="font-medium">{new Date(proposal.votingEndsAt).toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Voting Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between mb-1 text-sm">
                    <span>For</span>
                    <span className="font-semibold">{proposal.votesSummary.percentFor ?? 0}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all"
                      style={{ width: `${proposal.votesSummary.percentFor ?? 0}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1 text-sm">
                    <span>Against</span>
                    <span className="font-semibold">{proposal.votesSummary.percentAgainst ?? 0}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-red-500 h-2 rounded-full transition-all"
                      style={{ width: `${proposal.votesSummary.percentAgainst ?? 0}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1 text-sm">
                    <span>Abstain</span>
                    <span className="font-semibold">{proposal.votesSummary.totalVotes > 0 ? Math.round((proposal.votesSummary.weightsAbstain / proposal.totalWeight) * 100) : 0}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-gray-400 h-2 rounded-full transition-all"
                      style={{ width: `${proposal.votesSummary.totalVotes > 0 ? Math.round((proposal.votesSummary.weightsAbstain / proposal.totalWeight) * 100) : 0}%` }}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground pt-2">
                  Total votes: {proposal.votesSummary.totalVotes}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Voting Section */}
        {proposal.status === 'active' && (
          <Card>
            <CardHeader>
              <CardTitle>Cast Your Vote</CardTitle>
              {hasVoted && (
                <CardDescription>You voted <span className="font-semibold">{memberVote?.choice}</span></CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                {(['for', 'against', 'abstain'] as const).map((choice) => (
                  <Button
                    key={choice}
                    onClick={() => {
                      setSelectedVote(choice);
                      castVoteMutation.mutate(choice);
                    }}
                    variant={
                      selectedVote === choice || memberVote?.choice === choice
                        ? 'default'
                        : 'outline'
                    }
                    disabled={castVoteMutation.isPending}
                    className="flex-1"
                  >
                    {choice.charAt(0).toUpperCase() + choice.slice(1)}
                  </Button>
                ))}
              </div>
              {castVoteMutation.error && (
                <p className="text-sm text-red-600 mt-4">
                  {safeErrorMessage(castVoteMutation.error)}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Admin Actions */}
        {isAdmin && proposal.status === 'active' && (
          <Card className="border-orange-200 bg-orange-50">
            <CardHeader>
              <CardTitle className="text-base">Admin Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => closeVotingMutation.mutate()}
                disabled={closeVotingMutation.isPending}
                variant="destructive"
              >
                Close Voting
              </Button>
              {closeVotingMutation.error && (
                <p className="text-sm text-red-600 mt-4">
                  {safeErrorMessage(closeVotingMutation.error)}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Proposal Payload */}
        {proposal.payload && Object.keys(proposal.payload).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Proposal Details</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-lg overflow-auto text-xs">
                {JSON.stringify(proposal.payload, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Recent Votes */}
        {allVotes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Votes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {allVotes.slice(0, 10).map((vote) => (
                  <div key={vote.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-b-0">
                    <div>
                      <p className="font-mono text-xs">{vote.voter.slice(0, 10)}...</p>
                      <p className="text-muted-foreground text-xs">
                        {vote.voterContext?.tier} member, {vote.voterContext?.role}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-medium ${
                        vote.choice === 'for' ? 'text-green-600' : 
                        vote.choice === 'against' ? 'text-red-600' : 
                        'text-gray-600'
                      }`}>
                        {vote.choice.charAt(0).toUpperCase() + vote.choice.slice(1)}
                      </p>
                      <p className="text-muted-foreground text-xs">Weight: {vote.weight}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </FeatureGate>
  );
}
