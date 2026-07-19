import type { Metadata } from 'next'
import './globals.css'
import { RootProviders } from '@/lib/wallet/providers'
import { Nav } from '@/components/nav'
import { SwRegistrar } from '@/components/sw-registrar'

export const metadata: Metadata = {
  title: 'GuildPass',
  description: 'Web3 membership and token-gated community platform'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RootProviders>
          {/* Registers the service worker for dashboard offline caching */}
          <SwRegistrar />
          <Nav />
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        </RootProviders>
      </body>
    </html>
  )
}
