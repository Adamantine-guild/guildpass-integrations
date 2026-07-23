import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Exclude Next.js internals, public static assets, and global API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  const isMultiCommunity = process.env.NEXT_PUBLIC_FEATURE_MULTI_COMMUNITY === 'true'
  const defaultCommunity = 'guildpass-demo'

  const pathSegments = pathname.split('/').filter(Boolean)
  const firstSegment = pathSegments[0]
  const communityRoutes = ['dashboard', 'admin', 'developer', 'events', 'resources']

  if (!isMultiCommunity) {
    // ── MULTI-COMMUNITY DISABLED ─────────────────────────────────────────────
    
    // Internal rewrite /dashboard -> /guildpass-demo/dashboard
    if (firstSegment && communityRoutes.includes(firstSegment)) {
      const rewriteUrl = new URL(`/${defaultCommunity}${pathname}`, request.url)
      return NextResponse.rewrite(rewriteUrl)
    }

    // Redirect /[anyCommunitySlug]/dashboard -> /dashboard
    if (firstSegment && !communityRoutes.includes(firstSegment)) {
      const secondSegment = pathSegments[1]
      if (secondSegment && communityRoutes.includes(secondSegment)) {
        const cleanPath = pathname.substring(firstSegment.length + 1)
        const redirectUrl = new URL(cleanPath, request.url)
        return NextResponse.redirect(redirectUrl)
      }
    }
  } else {
    // ── MULTI-COMMUNITY ENABLED ──────────────────────────────────────────────
    
    if (pathname === '/') {
      return NextResponse.next()
    }

    // Redirect /dashboard -> /[lastActiveCommunity]/dashboard
    if (firstSegment && communityRoutes.includes(firstSegment)) {
      const lastActiveCommunity = request.cookies.get('gp-active-community')?.value || defaultCommunity
      const redirectUrl = new URL(`/${lastActiveCommunity}${pathname}`, request.url)
      return NextResponse.redirect(redirectUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
