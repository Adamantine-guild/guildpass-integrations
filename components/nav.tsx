"use client";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getApi } from "@/lib/api";
import { useAccount } from "wagmi";
import { cn } from "@/lib/utils";
import { ConnectButton } from "./wallet/connect-button";
import { useSiweAuth } from "@/lib/wallet/providers";
import { queryKeys } from "@/lib/query";
import { features } from "@/lib/features";
import { config } from "@/lib/config";
import { useTheme } from "@/components/theme-provider";
import { Moon, Sun } from "lucide-react";

export function Nav() {
  const pathname = usePathname();
  const { address } = useAccount();
  const { authSession } = useSiweAuth();
  const { theme, setTheme, mounted } = useTheme();

  const { data: session } = useQuery({
    queryKey: queryKeys.session.byAddress(address ?? ""),
    queryFn: () => getApi(address, authSession?.token).getSession(),
    staleTime: 10_000,
    enabled: !!address,
    retry: 1,
  });

  const isAdmin = !!session?.roles?.includes("admin");
  const items = [
    { href: "/dashboard" as Route, label: "Dashboard", enabled: true },
    { href: "/admin" as Route, label: "Admin", enabled: isAdmin },
    {
      href: "/admin/analytics" as Route,
      label: "Analytics",
      enabled: isAdmin && features.analytics,
    },
    {
      href: "/admin/settings" as Route,
      label: "Settings",
      enabled: isAdmin && features.adminSettings,
    },
    {
      href: "/resources/alpha" as Route,
      label: "Gated",
      enabled: features.resources,
    },
    { href: "/events/demo" as Route, label: "Event", enabled: features.events },
    {
      href: "/developer" as Route,
      label: "Dev",
      enabled: config.apiMode === "mock",
    },
  ].filter((it) => it.enabled);

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/dashboard"
          className="font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
          aria-label="GuildPass dashboard"
        >
          GuildPass
        </Link>
        <nav
          className="flex flex-wrap items-center gap-2 sm:gap-4"
          aria-label="Primary navigation"
        >
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "rounded-sm px-1 py-0.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                pathname?.startsWith(it.href) && "text-foreground font-medium",
              )}
              aria-current={pathname?.startsWith(it.href) ? "page" : undefined}
            >
              {it.label}
            </Link>
          ))}
          {mounted && (
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label={
                theme === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
              aria-pressed={theme === "dark"}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          )}
          <ConnectButton />
        </nav>
      </div>
    </header>
  );
}
