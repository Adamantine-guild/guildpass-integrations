"use client";

import { useAccount, useConnect, useDisconnect, injected } from "wagmi";
import { Button } from "@/components/ui/button";
import { useSiweAuth } from "@/lib/wallet/providers";
import { AddressText } from "./address-text";

export function ConnectButton() {
  const { isConnected, address } = useAccount();
  const { connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { sessionStatus, isSigningIn, signIn, logout, error } = useSiweAuth();

  if (!isConnected) {
    return (
      <Button
        id="wallet-connect-btn"
        size="sm"
        onClick={() => connect({ connector: injected() })}
        disabled={isConnecting}
        aria-busy={isConnecting}
      >
        {isConnecting ? "Connecting…" : "Connect Wallet"}
      </Button>
    );
  }

  if (sessionStatus === "authenticated") {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <AddressText
          address={address}
          className="text-xs text-muted-foreground"
        />
        <span
          id="siwe-authenticated-badge"
          role="status"
          className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
        >
          <svg
            className="h-3 w-3"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M2 6l3 3 5-5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Signed In
        </span>
        <Button
          id="wallet-signout-btn"
          variant="secondary"
          size="sm"
          onClick={logout}
        >
          Sign Out
        </Button>
      </div>
    );
  }

  if (sessionStatus === "expired") {
    return (
      <div className="flex max-w-full flex-col items-end gap-1">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <AddressText
            address={address}
            className="text-xs text-muted-foreground"
          />
          <span
            id="siwe-expired-badge"
            role="status"
            className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
          >
            Session Expired
          </span>
          <Button
            id="wallet-reauth-btn"
            size="sm"
            onClick={signIn}
            disabled={isSigningIn}
            aria-busy={isSigningIn}
            title="Your session expired — sign again to re-authenticate."
          >
            {isSigningIn ? "Signing…" : "Re-authenticate"}
          </Button>
          <Button
            id="wallet-disconnect-btn"
            variant="ghost"
            size="sm"
            onClick={() => disconnect()}
            aria-label="Disconnect wallet"
            className="text-muted-foreground"
          >
            Disconnect
          </Button>
        </div>
        {error && (
          <p
            id="wallet-signin-error"
            className="max-w-xs text-right text-xs text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    );
  }

  // sessionStatus === 'connected' | 'authenticating'
  return (
    <div className="flex max-w-full flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <AddressText
          address={address}
          className="text-xs text-muted-foreground"
        />
        <Button
          id="wallet-signin-btn"
          size="sm"
          onClick={signIn}
          disabled={isSigningIn}
          aria-busy={isSigningIn}
          title="Sign a one-time message to prove wallet ownership — no gas required."
        >
          {isSigningIn ? (
            <span className="flex items-center gap-1.5">
              <svg
                className="h-3 w-3 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8z"
                />
              </svg>
              Signing…
            </span>
          ) : (
            "Sign In"
          )}
        </Button>
        <Button
          id="wallet-disconnect-btn"
          variant="ghost"
          size="sm"
          onClick={() => disconnect()}
          aria-label="Disconnect wallet"
          className="text-muted-foreground"
        >
          Disconnect
        </Button>
      </div>
      {error && (
        <p
          id="wallet-signin-error"
          className="max-w-xs text-right text-xs text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
