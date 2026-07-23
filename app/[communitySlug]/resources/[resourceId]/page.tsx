'use client';
import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useAccount } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { getApi } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { Gated, AccessDenied } from '@/components/gated';
import { FeatureGate } from '@/components/feature-gate';
import { LoadingState, ErrorState, safeErrorMessage } from '@/components/ui/api-states';
import { ResourceContentRenderer } from '@/components/resources/resource-content-renderer';
import { features } from '@/lib/features';
import { EmptyState } from "@/components/ui/api-states";

export default function DynamicResourceDocs() {
  const params = useParams() as { resourceId: string; communitySlug?: string };
  const resourceId = params.resourceId;
  const communitySlug = params.communitySlug || 'guildpass-demo';
  const { address } = useAccount();

  const {
    data: resourceResult,
    isLoading: resourceLoading,
    refetch,
  } = useQuery({
    queryKey: queryKeys.resources.detail(resourceId, communitySlug),
    queryFn: () => getApi(address, undefined, communitySlug).getResource(resourceId),
    enabled: !!resourceId && !!address,
    retry: 1,
  });

  const resource = resourceResult?.status === 'found' ? resourceResult.data : undefined;

  const { data: policy, isLoading: policyLoading } = useQuery({
    queryKey: queryKeys.policies.byResource(resourceId, communitySlug),
    queryFn: () => getApi(address, undefined, communitySlug).getPolicy(resourceId),
    enabled: !!resourceId && !!address && resourceResult?.status === 'found',
    retry: 1,
  });

  const effectiveMinTier = useMemo(() => {
    return policy?.minTier !== undefined ? policy.minTier : resource?.minTier;
  }, [policy, resource]);

  if (!address) {
    return (
      <FeatureGate enabled={features.resources} name="Resources">
        <AccessDenied reason="Please connect your wallet to continue." />
      </FeatureGate>
    );
  }

  if (resourceLoading || policyLoading) {
    return (
      <FeatureGate enabled={features.resources} name="Resources">
        <LoadingState message="Loading resource…" />
      </FeatureGate>
    );
  }

  if (resourceResult?.status === 'error') {
    return (
      <FeatureGate enabled={features.resources} name="Resources">
        <ErrorState
          title="Could not load resource"
          message={safeErrorMessage(resourceResult.error)}
          onRetry={() => refetch()}
        />
      </FeatureGate>
    );
  }

  if (!resource) {
    return (
      <FeatureGate enabled={features.resources} name="Resources">
        <EmptyState
          title="Resource not found"
          message="The requested resource does not exist or has been removed."
        />
      </FeatureGate>
    );
  }

  return (
    <FeatureGate enabled={features.resources} name="Resources">
      <Gated
        minTier={effectiveMinTier}
        roles={policy?.roles ?? resource?.roles}
        rule={policy?.rule}
        resourceId={resourceId}
      >
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{resource.title}</h1>
          <p className="text-muted-foreground">
            {resource.description ? `${resource.description}. ` : ''}
            This page is gated at{' '}
            {effectiveMinTier
              ? `${effectiveMinTier.charAt(0).toUpperCase()}${effectiveMinTier.slice(1)}`
              : 'Standard'}{' '}
            tier and above.
          </p>

          <ResourceContentRenderer content={resource.content} />
        </div>
      </Gated>
    </FeatureGate>
  );
}
