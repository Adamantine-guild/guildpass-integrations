import { createPageMetadata } from '@/lib/page-metadata'

export const metadata = createPageMetadata(
  'Community Resources',
  'Open the GuildPass resources available to your verified membership tier.',
)

export default function ResourcesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
