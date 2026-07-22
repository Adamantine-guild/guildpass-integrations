import { createPageMetadata } from '@/lib/page-metadata'

export const metadata = createPageMetadata(
  'Member Dashboard',
  'Review your GuildPass membership, verification status, badges, and available resources.',
)

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
