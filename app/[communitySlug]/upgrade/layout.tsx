import { createPageMetadata } from '@/lib/page-metadata'

export const metadata = createPageMetadata(
  'Upgrade or Renew',
  'Learn how membership status, tier, and roles affect access, and what to do next.',
)

export default function UpgradeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
