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
  const {
    sessionStatus,
    authSession,
    signIn,
    isSigningIn,
    status: siweStatus,
    timeLeft: contextTimeLeft,
    warningThresholdSeconds = 120,
  } = useSiweAuth();
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
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  useEffect(() => {
    if (!authSession) {
      setTimeLeft(null);
      setIsDismissed(false);
      return;
    }

    const tick = () => {
      const diff = new Date(authSession.expiresAt).getTime() - Date.now();
      setTimeLeft(Math.max(0, Math.floor(diff / 1000)));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [authSession?.expiresAt, authSession]);

  // Reset dismissal state when session is renewed/extended
  useEffect(() => {
    if (timeLeft !== null && timeLeft > warningThresholdSeconds) {
      setIsDismissed(false);
    }
  }, [timeLeft, warningThresholdSeconds]);

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
      <SiwePrompt
        sessionStatus={sessionStatus}
        isSigningIn={isSigningIn}
        onSignIn={signIn}
      />
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

  const currentSeconds = timeLeft ?? contextTimeLeft;
  const isExpiring =
    !isDismissed &&
    currentSeconds !== null &&
    currentSeconds > 0 &&
    (siweStatus === 'expiring' || currentSeconds <= warningThresholdSeconds);

  return (
    <div className="space-y-4">
      {isExpiring && (
        <div
          role="status"
          aria-live="polite"
          aria-label="Session expiry warning banner"
          className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50 rounded-lg text-amber-900 dark:text-amber-200"
        >
          <div className="flex items-center gap-2 text-sm">
            <span aria-hidden="true">⚠️</span>
            <span>
              Your security session will expire in <strong>{currentSeconds}s</strong>. Action requests made after expiration will fail.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={signIn}
              disabled={isSigningIn}
              aria-busy={isSigningIn}
              aria-label="Extend your signed-in session"
              size="sm"
            >
              {isSigningIn ? 'Signing…' : 'Extend Session'}
            </Button>
            <button
              type="button"
              onClick={() => setIsDismissed(true)}
              aria-label="Dismiss session warning"
              className="text-xs text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-100 underline ml-2"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

export interface SiwePromptProps {
  sessionStatus?: string;
  isSigningIn?: boolean;
  onSignIn?: () => void;
  onClose?: () => void;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
  );
}

export function SiwePrompt({
  sessionStatus,
  isSigningIn = false,
  onSignIn,
  onClose,
}: SiwePromptProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const titleId = 'siwe-prompt-title';
  const descriptionId = 'siwe-prompt-description';

  useEffect(() => {
    const previousActiveElement = document.activeElement as HTMLElement | null;

    if (containerRef.current) {
      const focusableElements = getFocusableElements(containerRef.current);
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      } else {
        containerRef.current.focus();
      }
    }

    return () => {
      if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
        previousActiveElement.focus();
      }
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      onClose?.();
      return;
    }

    if (e.key === 'Tab' && containerRef.current) {
      const focusables = getFocusableElements(containerRef.current);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const firstElement = focusables[0];
      const lastElement = focusables[focusables.length - 1];
      const currentActive = document.activeElement;

      if (e.shiftKey) {
        if (currentActive === firstElement || currentActive === containerRef.current) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (currentActive === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
  };

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 outline-none"
    >
      <span className="sr-only">
        Your wallet is connected but not signed in. Sign in with Ethereum to
        unlock this administrative section.
      </span>
      <h2 id={titleId} className="text-xl font-bold mb-2">
        SIWE Authentication Required
      </h2>
      <p id={descriptionId} className="text-zinc-500 mb-4">
        {sessionStatus === 'expired'
          ? 'Your admin session has expired. Sign in again to continue.'
          : 'Accessing privileged management consoles requires a secure gasless authentication signature.'}
      </p>
      <Button
        onClick={onSignIn}
        disabled={isSigningIn}
        aria-busy={isSigningIn}
        aria-label="Sign in with Ethereum"
      >
        {isSigningIn ? 'Signing…' : 'Sign In With Ethereum'}
      </Button>
    </div>
  );
}

