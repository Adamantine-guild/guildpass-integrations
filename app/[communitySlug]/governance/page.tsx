'use client';

import { useParams, useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { getApi } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { FeatureGate } from '@/components/feature-gate';
import { features } from '@/lib/features';
import { LoadingState, ErrorState, EmptyState, safeErrorMessage } from '@/components/ui/api-states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ProposalStatusBadge } from './proposal-status-badge';
import { useSiweAuth } from '@/lib/wallet/providers';
import { useState } from 'react';

export default function GovernancePage() {
  const params = useParams() as { communitySlug?: string };
  const communitySlug = params.communitySlug || 'guildpass-demo';
  const router = useRouter();
  const { address } = useAccount();
  const { session } = useSiweAuth();
  const [filter, setFilter] = useState<'all' | 'active' | 'draft' | 'closed' | 'resolved'>('all');

  const isAdmin = session?.roles?.includes('admin') ?? false;

  const {
    data: proposals,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.governance.list(communitySlug, filter === 'all' ? undefined : filter),
    queryFn: () =>
      getApi(address, session?.token, communitySlug).listProposals({
        filter: filter === 'all' ? undefined : (filter as any),
      }),
    enabled: !!address,
  });

  if (!address) {
    return (
      <FeatureGate enabled={features.governance} name="Governance">
        <div className="p-8 text-center">
          <h1 className="text-2xl font-bold mb-4">Governance</h1>
          <p className="text-muted-foreground mb-6">Please connect your wallet to participate in governance.</p>
        </div>
      </FeatureGate>
    );
  }

  if (isLoading) {
    return (
      <FeatureGate enabled={features.governance} name="Governance">
        <LoadingState message="Loading proposals…" />
      </FeatureGate>
    );
  }

  if (error) {
    return (
      <FeatureGate enabled={features.governance} name="Governance">
        <ErrorState
          title="Could not load proposals"
          message={safeErrorMessage(error)}
          onRetry={() => refetch()}
        />
      </FeatureGate>
    );
  }

  return (
    <FeatureGate enabled={features.governance} name="Governance">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Governance</h1>
            <p className="text-muted-foreground mt-2">
              Participate in community decisions through proposals and voting
            </p>
          </div>
          {isAdmin && (
            <Button
              onClick={() => router.push(`/${communitySlug}/governance/create`)}
              className="w-full sm:w-auto"
            >
              Create Proposal
            </Button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 border-b">
          {(['all', 'active', 'draft', 'closed', 'resolved'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 font-medium text-sm transition-colors ${
                filter === f
                  ? 'text-foreground border-b-2 border-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Proposals List */}
        {!proposals || proposals.length === 0 ? (
          <EmptyState
            title="No proposals yet"
            message={filter === 'all'
              ? 'No proposals have been created. Check back soon!'
              : `No ${filter} proposals at this time.`
            }
          />
        ) : (
          <div className="grid gap-4">
            {proposals.map((proposal) => (
              <Card
                key={proposal.id}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => router.push(`/${communitySlug}/governance/${proposal.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold truncate">{proposal.title}</h3>
                        <ProposalStatusBadge status={proposal.status} />
                      </div>
                      <CardDescription className="line-clamp-2">
                        {proposal.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Votes</p>
                      <p className="font-semibold">{proposal.votesSummary.totalVotes}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">For</p>
                      <p className="font-semibold text-green-600">
                        {proposal.votesSummary.percentFor ?? 0}%
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Against</p>
                      <p className="font-semibold text-red-600">
                        {proposal.votesSummary.percentAgainst ?? 0}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </FeatureGate>
  );
}
