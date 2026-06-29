'use client'
import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { getApi } from '@/lib/api'
import { useAccount } from 'wagmi'
import { cn } from '@/lib/utils'
import { ConnectButton } from './wallet/connect-button'
import { useSiweAuth } from '@/lib/wallet/providers'
import { queryKeys } from '@/lib/query'
import { features } from '@/lib/features'
import { config } from '@/lib/config'

export function Nav() {
  const pathname = usePathname()
  const { address } = useAccount()
  const { authSession } = useSiweAuth()

  const { data: session } = useQuery({
    queryKey: queryKeys.session.byAddress(address ?? ''),
    queryFn: () => getApi(address, authSession?.token).getSession(),
    staleTime: 10_000,
    enabled: !!address,
    retry: 1
  })

  const isAdmin = !!session?.roles?.includes('admin')
  const items = [
    { href: '/dashboard' as Route, label: 'Dashboard', enabled: true },
    { href: '/admin' as Route, label: 'Admin', enabled: isAdmin },
    { href: '/resources/alpha' as Route, label: 'Gated', enabled: features.resources },
    { href: '/events/demo' as Route, label: 'Event', enabled: features.events },
    { href: '/developer' as Route, label: 'Dev', enabled: config.apiMode === 'mock' },
  ].filter((it) => it.enabled)

  return (
    <div className="border-b">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="font-semibold">
          GuildPass
        </Link>
        <nav className="flex items-center gap-4">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                'text-sm text-muted-foreground hover:text-foreground',
                pathname?.startsWith(it.href) && 'text-foreground font-medium'
              )}
            >
              {it.label}
            </Link>
          ))}
          <ConnectButton />
        </nav>
      </div>
    </div>
  )
}
