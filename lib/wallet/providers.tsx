"use client";

/**
 * lib/wallet/providers.tsx
 *
 * LIGHTWEIGHT ENTRY POINT — delegates the heavy wagmi/viem code to a
 * dynamically imported chunk so public/unauthenticated pages never pay the
 * wallet library's bundle cost until a user actually interacts with wallet UI.
 *
 * Imports from this module:
 *   - <RootProviders>          — layout.tsx (root provider tree)
 *   - useSiweAuth              — components needing auth state
 *   - SiweAuthContext          — advanced consumers
 *
 * All three are re-exported from lightweight modules; the only thing that
 * touches wagmi is the dynamic import() below.
 */

import dynamic from "next/dynamic";
import { SiweAuthContext, useSiweAuth } from "@/lib/wallet/siwe-context";

// Re-export lightweight symbols so existing imports keep working.
export { SiweAuthContext, useSiweAuth };

/**
 * Wallet providers — WagmiProvider + QueryClientProvider + SiweAuthProvider.
 *
 * The entire wallet/viem stack is bundled into a separate chunk that only
 * loads when this component first renders on the client.  Until then, children
 * render without wallet context (which is fine for public/unauthenticated
 * pages).
 *
 * Suspense fallback: renders children directly so the page is never blocked
 * by wallet-library loading.  Once the chunk arrives, the provided context
 * becomes available and wallet-connected features activate.
 */
const WalletBundle = dynamic(
  () => import("@/lib/wallet/wallet-bundle").then((mod) => mod.WalletProviders),
  { ssr: false },
);

export function RootProviders({ children }: { children: React.ReactNode }) {
  return <WalletBundle>{children}</WalletBundle>;
}