"use client";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter, useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getApi } from "@/lib/api";
import { useAccount } from "wagmi";
import { cn } from "@/lib/utils";
import { ConnectButton } from "./wallet/connect-button";
import { useSiweAuth } from "@/lib/wallet/providers";
import { queryKeys } from "@/lib/query";
import { features } from "@/lib/features";
import { config } from "@/lib/config";
import { useState, useRef, useEffect } from "react";

const AVAILABLE_COMMUNITIES = [
  { id: 'guildpass-demo', name: 'GuildPass Demo' },
  { id: 'builders-collective', name: 'Builders Collective' },
  { id: 'design-guild', name: 'Design Guild' },
  { id: 'guildpass-hub', name: 'GuildPass Hub' },
];

function CommunitySwitcher({ activeSlug }: { activeSlug: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  const currentCommunity = AVAILABLE_COMMUNITIES.find((c) => c.id === activeSlug) || AVAILABLE_COMMUNITIES[0];

  useEffect(() => {
    // Set a cookie so the middleware remembers this community
    document.cookie = `gp-active-community=${activeSlug}; path=/; max-age=31536000`;
  }, [activeSlug]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (slug: string) => {
    setIsOpen(false);
    document.cookie = `gp-active-community=${slug}; path=/; max-age=31536000`;
    
    // Rewrite path segment: /[oldSlug]/[subPage] -> /[newSlug]/[subPage]
    const pathSegments = pathname.split('/').filter(Boolean);
    if (pathSegments[0] === activeSlug) {
      pathSegments[0] = slug;
    } else {
      pathSegments.unshift(slug);
    }
    const newPath = '/' + pathSegments.join('/');
    router.push(newPath as Route);
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-950 transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="true"
        type="button"
      >
        <span>{currentCommunity.name}</span>
        <svg
          className={cn("h-3.5 w-3.5 text-zinc-500 transition-transform duration-200", isOpen && "rotate-180")}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-56 origin-top-left rounded-md bg-white dark:bg-zinc-950 shadow-lg ring-1 ring-black ring-opacity-5 dark:ring-zinc-800 focus:outline-none z-50 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-900">
          <div className="py-1" role="menu" aria-orientation="vertical">
            {AVAILABLE_COMMUNITIES.map((community) => (
              <button
                key={community.id}
                onClick={() => handleSelect(community.id)}
                className={cn(
                  "flex w-full items-center justify-between px-4 py-2 text-left text-xs transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900",
                  community.id === activeSlug
                    ? "bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-semibold"
                    : "text-zinc-700 dark:text-zinc-300"
                )}
                role="menuitem"
              >
                <span>{community.name}</span>
                {community.id === activeSlug && (
                  <svg className="h-4 w-4 text-indigo-600 dark:text-indigo-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CommunitySwitcher() {
  return (
    <div
      className="relative inline-flex"
      title="More communities coming soon"
    >
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-label="Community switcher (disabled, more communities coming soon)"
        className={cn(
          "flex items-center gap-1 rounded-sm border px-2 py-1 text-sm text-muted-foreground",
          "cursor-not-allowed opacity-60",
        )}
      >
        GuildPass Community
        <span aria-hidden="true">▾</span>
      </button>
    </div>
  );
}

export function Nav() {
  const pathname = usePathname();
  const { address } = useAccount();
  const { authSession } = useSiweAuth();
  const params = useParams();
  const communitySlug = (params?.communitySlug as string) || 'guildpass-demo';

  const { data: session } = useQuery({
    queryKey: queryKeys.session.byAddress(address ?? "", communitySlug),
    queryFn: () => getApi(address, authSession?.token, communitySlug).getSession(),
    staleTime: 10_000,
    enabled: !!address,
    retry: 1,
  });

  const prefix = features.multiCommunity ? `/${communitySlug}` : "";
  const isAdmin = !!session?.roles?.includes("admin");

  const items = [
    { href: `${prefix}/dashboard` as Route, label: "Dashboard", enabled: true },
    { href: `${prefix}/admin` as Route, label: "Admin", enabled: isAdmin },
    {
      href: `${prefix}/admin/analytics` as Route,
      label: "Analytics",
      enabled: isAdmin && features.analytics,
    },
    {
      href: `${prefix}/admin/rewards` as Route,
      label: "Rewards",
      enabled: isAdmin && features.rewards,
    },
    {
      href: `${prefix}/admin/settings` as Route,
      label: "Settings",
      enabled: isAdmin && features.adminSettings,
    },
    {
      href: `${prefix}/resources/alpha` as Route,
      label: "Gated",
      enabled: features.resources,
    },
    { href: `${prefix}/events/demo` as Route, label: "Event", enabled: features.events },
    {
      href: `${prefix}/developer` as Route,
      label: "Dev",
      enabled: config.apiMode === "mock",
    },
  ].filter((it) => it.enabled);

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`${prefix}/dashboard`}
            className="font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
            aria-label="GuildPass dashboard"
          >
            GuildPass
          </Link>
          {features.multiCommunity && (
            <CommunitySwitcher activeSlug={communitySlug} />
          )}
        </div>
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
                pathname === it.href && "text-foreground font-medium",
              )}
              aria-current={pathname === it.href ? "page" : undefined}
            >
              {it.label}
            </Link>
          ))}
          {features.multiCommunity && <CommunitySwitcher />}
          <ConnectButton />
        </nav>
      </div>
    </header>
  );
}
