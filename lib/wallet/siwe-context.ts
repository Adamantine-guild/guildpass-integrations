'use client';
import { createContext, useContext } from 'react';
import type { SiweAuthSession } from '@/lib/api/types';

/**
 * SIWE auth context, extracted from providers.tsx so it can be imported without
 * pulling in the wallet/wagmi stack. Tests and lightweight consumers depend on
 * this module; providers.tsx supplies the value.
 */
export interface SiweAuthContextType {
  session: SiweAuthSession | null;
  status: 'disconnected' | 'unauthenticated' | 'authenticated' | 'expiring';
  timeLeft: number;
  login: () => Promise<void>;
  logout: () => void;
}

export const SiweAuthContext = createContext<SiweAuthContextType | undefined>(
  undefined,
);

export function useSiweAuth(): SiweAuthContextType {
  const context = useContext(SiweAuthContext);
  if (!context) throw new Error('useSiweAuth must be used within SiweAuthProvider');
  return context;
}
