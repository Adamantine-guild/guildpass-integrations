import { createPageMetadata } from '@/lib/page-metadata'

export const metadata = createPageMetadata(
  'Admin Dashboard',
  'Manage GuildPass members, access policies, events, analytics, and community settings.',
)

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
