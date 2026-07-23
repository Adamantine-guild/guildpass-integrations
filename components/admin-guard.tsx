'use client';

import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { getApi } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { useSiweAuth } from '@/lib/wallet/providers';
import { Button } from '@/components/ui/button';
import { useParams } from 'next/navigation';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { sessionStatus, authSession, signIn, isSigningIn } = useSiweAuth();
  const { address } = useAccount();
  const params = useParams();
  const communitySlug = (params?.communitySlug as string) || 'guildpass-demo';

  const { data: session } = useQuery({
    queryKey: queryKeys.session.byAddress(address ?? authSession?.address ?? '', communitySlug),
    queryFn: () => getApi(address ?? authSession?.address, authSession?.token, communitySlug).getSession(),
    enabled: sessionStatus === 'authenticated' && !!(address ?? authSession?.address),
    staleTime: 10_000,
    retry: 1,
  });
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!authSession) {
      setTimeLeft(null);
      return;
    }

    const tick = () => {
      const diff = new Date(authSession.expiresAt).getTime() - Date.now();
      setTimeLeft(Math.max(0, Math.floor(diff / 1000)));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [authSession]);

  if (sessionStatus === 'disconnected') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Access blocked: wallet disconnected"
        className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800"
      >
        <span className="sr-only">
          This administrative section is locked because no wallet is connected.
          Connect your administrative wallet to continue.
        </span>
        <h2 className="text-xl font-bold mb-2">Wallet Disconnected</h2>
        <p className="text-zinc-500 mb-4">Please connect your administrative wallet to access this section.</p>
      </div>
    );
  }

  if (sessionStatus !== 'authenticated') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Access blocked: sign-in required"
        className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800"
      >
        <span className="sr-only">
          Your wallet is connected but not signed in. Sign in with Ethereum to
          unlock this administrative section.
        </span>
        <h2 className="text-xl font-bold mb-2">SIWE Authentication Required</h2>
        <p className="text-zinc-500 mb-4">
          {sessionStatus === 'expired'
            ? 'Your admin session has expired. Sign in again to continue.'
            : 'Accessing privileged management consoles requires a secure gasless authentication signature.'}
        </p>
        <Button
          onClick={signIn}
          disabled={isSigningIn}
          aria-busy={isSigningIn}
        >
          {isSigningIn ? 'Signing…' : 'Sign In With Ethereum'}
        </Button>
      </div>
    );
  }

  if (!session?.roles?.includes('admin')) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800">
        <h2 className="text-xl font-bold mb-2">Admin Role Required</h2>
        <p className="text-zinc-500 mb-4">Your authenticated wallet does not have the admin role required for this section.</p>
      </div>
    );
  }

  const isExpiring = timeLeft !== null && timeLeft > 0 && timeLeft <= 60;

  return (
    <div className="space-y-4">
      {isExpiring && (
        <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50 rounded-lg text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2 text-sm">
            <span aria-hidden="true">⚠️</span>
            <span>Your security session will expire in <strong>{timeLeft}s</strong>. Action requests made after expiration will fail.</span>
          </div>
          <Button
            onClick={signIn}
            disabled={isSigningIn}
            aria-busy={isSigningIn}
            size="sm"
          >
            {isSigningIn ? 'Signing…' : 'Extend Session'}
          </Button>
        </div>
      )}
      {children}
    </div>
  );
}
