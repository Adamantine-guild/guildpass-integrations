'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { getApi } from '@/lib/api'
import { useAccount } from 'wagmi'
import { cn } from '@/lib/utils'
import { ConnectButton } from './wallet/connect-button'
import { useSiweAuth } from '@/lib/wallet/providers'

export function Nav() {
  const pathname = usePathname()
  const { address } = useAccount()
  const { authSession } = useSiweAuth()

  const { data: session } = useQuery({
    queryKey: ['session', address],
    queryFn: () => getApi(address, authSession?.token).getSession(),
    staleTime: 10_000,
    enabled: !!address,
  })

  const isAdmin = !!session?.roles?.includes('admin')
  const items = [
    { href: '/dashboard', label: 'Dashboard' },
    ...(isAdmin ? [{ href: '/admin', label: 'Admin' }] : []),
    { href: '/resources/alpha', label: 'Gated' },
    { href: '/events/demo', label: 'Event' },
  ]

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
