'use client';

import {
  PropsWithChildren,
  useCallback,
  useEffect,
  useState,
} from 'react'
import { WagmiProvider, createConfig, useSignMessage, useAccount, useDisconnect } from 'wagmi'
import { walletConfig } from '@/lib/wallet/config'
import { QueryClient, QueryClientProvider, useQueryClient, QueryCache } from '@tanstack/react-query'
import { getApi } from '@/lib/api'
import { config } from '@/lib/config'
import { SiweAuthSession, AdminSessionStatus } from '@/lib/api/types'
import { clearAuthSession, loadAuthSession, storeAuthSession } from '@/lib/session'
import { isApiError } from '@/lib/api/errors'
import { accessKeys, queryKeys } from '@/lib/query'
import { SiweAuthContext, useSiweAuth, type SiweAuthContextType } from '@/lib/wallet/siwe-context'

// ── Wagmi config ─────────────────────────────────────────────────────────────

const wagmiConfig = createConfig(walletConfig)

// ── SIWE Auth Context ─────────────────────────────────────────────────────────
//
// The context, its type, and the useSiweAuth hook live in
// '@/lib/wallet/siwe-context' so they can be imported without pulling in the
// wagmi/wallet stack. This provider supplies the value.

// Re-export for existing consumers that import useSiweAuth from this module.
export { useSiweAuth } from '@/lib/wallet/siwe-context'

const queryClient = new QueryClient();

export function SiweAuthProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const [session, setSession] = useState<SiweAuthSession | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  const logout = useCallback(() => {
    setSession(null);
    setTimeLeft(0);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('siwe_session');
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('siwe_session');
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as SiweAuthSession;
          if (new Date(parsed.expiresAt).getTime() > Date.now()) {
            setSession(parsed);
          } else {
            sessionStorage.removeItem('siwe_session');
          }
        } catch (_) {
          sessionStorage.removeItem('siwe_session');
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!isConnected || (session && session.address !== address)) {
      logout();
    }
  }, [address, isConnected, session, logout]);

  useEffect(() => {
    if (!session) {
      setTimeLeft(0);
      return;
    }

    const calculateTime = () => {
      const diff = new Date(session.expiresAt).getTime() - Date.now();
      const seconds = Math.max(0, Math.floor(diff / 1000));
      setTimeLeft(seconds);
      if (seconds <= 0) {
        logout();
      }
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [session, logout]);

  const login = async () => {
    if (!address) return;
    try {
      const nonceRes = await fetch('/v1/auth/siwe/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      });
      const { nonce } = await nonceRes.json();

      const message = `localhost:3000 wants you to sign in with your Ethereum account:\n${address}\n\nSIWE Session Authentication\n\nNonce: ${nonce}`;
      const signature = await signMessageAsync({ message });

      const verifyRes = await fetch('/v1/auth/siwe/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature })
      });

      const data = await verifyRes.json();
      if (data.token) {
        setSession(data);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('siwe_session', JSON.stringify(data));
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  let status: SiweAuthContextType['status'] = 'unauthenticated';
  if (!isConnected) status = 'disconnected';
  else if (session && timeLeft <= 60 && timeLeft > 0) status = 'expiring';
  else if (session && timeLeft > 0) status = 'authenticated';

  return (
    <SiweAuthContext.Provider value={{ session, status, timeLeft, login, logout }}>
      {children}
    </SiweAuthContext.Provider>
  );
}

export function RootProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SiweAuthProvider>
          {children}
        </SiweAuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
