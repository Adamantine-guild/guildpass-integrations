import { createPageMetadata } from '@/lib/page-metadata'

export const metadata = createPageMetadata(
  'Community Events',
  'Explore GuildPass community events and membership-aware event experiences.',
)

export default function EventsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
