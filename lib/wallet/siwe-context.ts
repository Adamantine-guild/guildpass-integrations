'use client';
import { createContext, useContext } from 'react';
import type { SiweAuthSession } from '@/lib/api/types';

/**
 * Callback registered by a mutation when it fails with a 401.
 * Called after the user successfully re-authenticates, with the fresh session
 * so the mutation can re-invoke its API call with the new token.
 * Must return a Promise that resolves/rejects based on the retried call.
 */
export type PendingRetryCallback = (freshSession: SiweAuthSession) => Promise<void>;

/**
 * SIWE auth context, extracted from providers.tsx so it can be imported without
 * pulling in the wallet/wagmi stack. Tests and lightweight consumers depend on
 * this module; providers.tsx supplies the value.
 */
export interface SiweAuthContextType {
  session: SiweAuthSession | null;
  status: 'disconnected' | 'unauthenticated' | 'authenticated' | 'expiring';
  timeLeft: number;
  isExpiring?: boolean;
  warningThresholdSeconds?: number;
  login: () => Promise<void>;
  logout: () => void;
  /**
   * Register a callback to be automatically retried once after the user
   * successfully re-authenticates following a 401.  The callback receives the
   * fresh session so it can supply the new token to its API call.
   *
   * Only one retry is attempted per registration — if the retried call also
   * returns a 401 the callback is discarded and an error is surfaced.
   */
  registerPendingRetry: (callback: PendingRetryCallback) => void;
}

export const SiweAuthContext = createContext<SiweAuthContextType | undefined>(
  undefined,
);

export function useSiweAuth(): SiweAuthContextType {
  const context = useContext(SiweAuthContext);
  if (!context) throw new Error('useSiweAuth must be used within SiweAuthProvider');
  return context;
}
