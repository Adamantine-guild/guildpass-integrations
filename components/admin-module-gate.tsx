'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { useParams } from 'next/navigation';
import { getApi } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { useSiweAuth } from '@/lib/wallet/providers';
import { AdminGuard } from '@/components/admin-guard';
import { FeatureUnavailable } from '@/components/feature-gate';
import {
  getAdminModule,
  isAdminModuleEnabled,
  adminRegistry,
  type AdminModule,
} from '@/lib/admin-modules';
import { DeniedState } from '@/components/ui/api-states';

interface AdminModuleGateProps {
  moduleId: string;
  children?: React.ReactNode;
}

/**
 * Gate component that enforces AdminModule plugin requirements (feature flags & user roles).
 * Dynamically looks up module definition from the registry.
 */
export function AdminModuleGate({ moduleId, children }: AdminModuleGateProps) {
  const { address } = useAccount();
  const { authSession, sessionStatus } = useSiweAuth();
  const params = useParams();
  const communitySlug = (params?.communitySlug as string) || 'guildpass-demo';

  const { data: session } = useQuery({
    queryKey: queryKeys.session.byAddress(address ?? authSession?.address ?? '', communitySlug),
    queryFn: () => getApi(address ?? authSession?.address, authSession?.token, communitySlug).getSession(),
    enabled: sessionStatus === 'authenticated' && !!(address ?? authSession?.address),
    staleTime: 10_000,
    retry: 1,
  });

  const module = getAdminModule(moduleId);

  if (!module) {
    return (
      <AdminGuard>
        <DeniedState
          title="Module Not Found"
          message={`Admin module '${moduleId}' is not registered.`}
        />
      </AdminGuard>
    );
  }

  // Evaluate Feature Flag
  const isFeatureOk = adminRegistry.isFeatureEnabled(module, { userIdentifier: address });
  if (!isFeatureOk) {
    return (
      <AdminGuard>
        <FeatureUnavailable name={module.navLabel || module.id} />
      </AdminGuard>
    );
  }

  // Evaluate User Role
  const isRoleOk = adminRegistry.hasRequiredRole(module, session?.roles);
  if (sessionStatus === 'authenticated' && session && !isRoleOk) {
    return (
      <AdminGuard>
        <DeniedState
          title="Role Required"
          message={`Your account lacks the required role to access the ${module.navLabel || module.id} module.`}
        />
      </AdminGuard>
    );
  }

  const Component = module.component;

  return (
    <AdminGuard>
      {Component ? <Component /> : children}
    </AdminGuard>
  );
}
