'use client';

import React, { useEffect, useState } from 'react';
import { useSiweAuth } from '@/lib/wallet/providers';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { sessionStatus, authSession, signIn, isSigningIn } = useSiweAuth();
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
        <span style={srOnly}>
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
        <span style={srOnly}>
          Your wallet is connected but not signed in. Sign in with Ethereum to
          unlock this administrative section.
        </span>
        <h2 className="text-xl font-bold mb-2">SIWE Authentication Required</h2>
        <p className="text-zinc-500 mb-4">
          {sessionStatus === 'expired'
            ? 'Your admin session has expired. Sign in again to continue.'
            : 'Accessing privileged management consoles requires a secure gasless authentication signature.'}
        </p>
        <button
          onClick={signIn}
          disabled={isSigningIn}
          className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 dark:bg-zinc-50 dark:text-zinc-900 rounded-md transition-colors hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
        >
          {isSigningIn ? 'Signing…' : 'Sign In With Ethereum'}
        </button>
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
          <button
            onClick={signIn}
            disabled={isSigningIn}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded transition-colors disabled:opacity-50"
          >
            {isSigningIn ? 'Signing…' : 'Extend Session'}
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
