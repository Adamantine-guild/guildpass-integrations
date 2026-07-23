import type { Metadata } from 'next'

const SITE_NAME = 'GuildPass'

export function createPageMetadata(
  title: string,
  description: string,
): Metadata {
  return {
    title,
    description,
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      siteName: SITE_NAME,
      type: 'website',
    },
  }
}
