import { NextRequest, NextResponse } from 'next/server'
import {
  fetchMembershipByWallet,
  GatewayConfigurationError,
  GatewayDependencyError,
  GatewayMethodError,
} from '@/lib/integration-client'
import { rateLimitRequest } from '@/lib/rate-limit'
import { validateIntegrationGatewayCsrf } from '@/lib/csrf'
import { isWalletAddress } from '@/lib/wallet/address'
import {
  resilientCall,
  CircuitOpenError,
} from '@/lib/integration/resilientCall'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const csrfError = validateIntegrationGatewayCsrf(req)
  if (csrfError) return csrfError

  const address = req.nextUrl.searchParams.get('address')

  // Enforce per-IP / per-wallet rate limit before any downstream call.
  const rl = rateLimitRequest(req, address)
  if (rl.limited) {
    return new NextResponse(
      JSON.stringify({ error: 'Too many requests', retryAfter: rl.retryAfter }),
      {
        status: 429,
        headers: {
          'Retry-After': String(rl.retryAfter),
          'X-RateLimit-Remaining': String(rl.remaining),
        },
      },
    )
  }

  if (!address) {
    return NextResponse.json(
      { error: 'Missing required query parameter: address' },
      { status: 400 },
    )
  }

  // Reject malformed addresses before they ever reach
  // @guildpass/integration-client - this route proxies a privileged
  // server-only key, so it must not forward arbitrary/oversized input.
  if (!isWalletAddress(address)) {
    return NextResponse.json(
      { error: 'Invalid address format.' },
      { status: 400 },
    )
  }

  try {
    const membership = await resilientCall(
      () => fetchMembershipByWallet(address),
      { key: 'membership' },
    )
    return NextResponse.json(membership)
  } catch (error) {
    console.error('[Integration Gateway Error]:', error)

    if (error instanceof CircuitOpenError) {
      return NextResponse.json(
        { error: 'Integration gateway temporarily unavailable (circuit open).' },
        { status: 503 },
      )
    }
    if (error instanceof GatewayConfigurationError) {
      return NextResponse.json(
        { error: 'Integration gateway misconfigured.' },
        { status: 503 },
      )
    }
    if (error instanceof GatewayDependencyError) {
      return NextResponse.json(
        { error: 'Integration gateway unavailable: missing optional dependency.' },
        { status: 503 },
      )
    }
    if (error instanceof GatewayMethodError) {
      return NextResponse.json(
        { error: 'Integration gateway unavailable: unsupported client method.' },
        { status: 503 },
      )
    }

    return NextResponse.json(
      { error: 'Unable to fetch membership information due to an internal error.' },
      { status: 502 },
    )
  }
}
