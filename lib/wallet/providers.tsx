'use client';

import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
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
import { recordSiweDebug } from '@/lib/api/siwe-debug'

// ── Wagmi config ─────────────────────────────────────────────────────────────

const wagmiConfig = createConfig(walletConfig)

// ── SIWE Auth Context ─────────────────────────────────────────────────────────

export interface SiweAuthContextValue {
  /** The authenticated session, or null if the user has not signed in. */
  authSession: SiweAuthSession | null
  isAuthenticated: boolean
  /** Granular status of the admin session. */
  sessionStatus: AdminSessionStatus
  /** True while a signature request is in-flight. */
  isSigningIn: boolean
  /** Human-readable error from the most recent signIn attempt, if any. */
  error: string | null
  /** Trigger the EIP-4361 sign-in flow for the currently connected address. */
  signIn: () => Promise<void>
  /** Clear the session and disconnect the wallet. */
  logout: () => Promise<void>
  /** Mark the current session as expired (e.g. after a 401 from the backend). */
  markExpired: () => void
}

interface SiweAuthContextType {
  session: SiweSession | null;
  status: 'disconnected' | 'unauthenticated' | 'authenticated' | 'expiring';
  timeLeft: number;
  login: () => Promise<void>;
  logout: () => void;
}

const SiweAuthContext = createContext<SiweAuthContextType | undefined>(undefined);
const queryClient = new QueryClient();

export function SiweAuthProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const [session, setSession] = useState<SiweSession | null>(null);
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
          const parsed = JSON.parse(stored) as SiweSession;
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
        recordSiweDebug({
          message,
          nonce,
          token: data.token,
          expiresAt: data.expiresAt,
        });
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

export function useSiweAuth() {
  const context = useContext(SiweAuthContext);
  if (!context) throw new Error('useSiweAuth must be used within SiweAuthProvider');
  return context;
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
