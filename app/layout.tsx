import type { Metadata } from 'next'
import './globals.css'
import { RootProviders } from '@/lib/wallet/providers'
import { Nav } from '@/components/nav'
import { SwRegistrar } from '@/components/sw-registrar'
import { ThemeProvider } from '@/components/theme-provider'

const themeScript = `
  try {
    const storedTheme = localStorage.getItem('guildpass-theme')
    const theme =
      storedTheme === 'light' || storedTheme === 'dark'
        ? storedTheme
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
  } catch {}
`

export const metadata: Metadata = {
  title: 'GuildPass',
  description: 'Web3 membership and token-gated community platform'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <RootProviders>
            {/* Registers the service worker for dashboard offline caching */}
            <SwRegistrar />
            <Nav />
            <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
          </RootProviders>
        </ThemeProvider>
      </body>
    </html>
  )
}
