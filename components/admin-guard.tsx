'use client';
import React from 'react';
import { useSiweAuth } from '../lib/wallet/siwe-context';

/**
 * sr-only utility: visually hidden but exposed to assistive tech. Inlined here
 * (rather than relying on a global .sr-only class) so the guard's accessible
 * text is self-contained and cannot regress if global styles change.
 */
const srOnly: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  borderWidth: 0,
};

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { status, timeLeft, login } = useSiweAuth();

  if (status === 'disconnected') {
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

  if (status === 'unauthenticated' || timeLeft <= 0) {
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
        <p className="text-zinc-500 mb-4">Accessing privileged management consoles requires a secure gasless authentication signature.</p>
        <button
          onClick={login}
          aria-label="Sign in with Ethereum to unlock this section"
          className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 dark:bg-zinc-50 dark:text-zinc-900 rounded-md transition-colors hover:bg-zinc-800 dark:hover:bg-zinc-200"
        >
          Sign In With Ethereum
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {status === 'expiring' && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50 rounded-lg text-amber-900 dark:text-amber-200"
        >
          <div className="flex items-center gap-2 text-sm">
            <span aria-hidden="true">⚠️</span>
            <span>Your security session will expire in <strong>{timeLeft}s</strong>. Action requests made after expiration will fail.</span>
          </div>
          <button
            onClick={login}
            aria-label="Extend your signed-in session"
            className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded transition-colors"
          >
            Extend Session
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
