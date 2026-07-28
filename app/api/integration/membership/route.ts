import { randomUUID } from 'node:crypto'
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
import { resilientCall, CircuitOpenError } from '@/lib/integration/resilientCall'
import {
  logGatewayRequest,
  safeErrorMessage,
  withRequestId,
  type RateLimitOutcome,
} from '@/lib/observability/request-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const start = Date.now()
  const correlationId = randomUUID()
  const address = req.nextUrl.searchParams.get('address')
  const path = req.nextUrl.pathname
  let status = 500
  let rateLimit: RateLimitOutcome = 'not_applicable'
  let errorMessage: string | undefined

  try {
    const csrfError = validateIntegrationGatewayCsrf(req)
    if (csrfError) {
      status = csrfError.status
      return await withRequestId(csrfError, correlationId)
    }

    // Enforce per-IP / per-wallet rate limit before any downstream call.
    const rl = rateLimitRequest(req, address)
    rateLimit = rl.limited ? 'limited' : 'allowed'
    if (rl.limited) {
      status = 429
      return new NextResponse(
        JSON.stringify({
          error: 'Too many requests',
          retryAfter: rl.retryAfter,
          requestId: correlationId,
        }),
        {
          status,
          headers: {
            'Retry-After': String(rl.retryAfter),
            'X-RateLimit-Remaining': String(rl.remaining),
          },
        },
      )
    }

    if (!address) {
      status = 400
      return NextResponse.json(
        { error: 'Missing required query parameter: address', requestId: correlationId },
        { status },
      )
    }

    // Reject malformed addresses before they ever reach
    // @guildpass/integration-client - this route proxies a privileged
    // server-only key, so it must not forward arbitrary/oversized input.
    if (!isWalletAddress(address)) {
      status = 400
      return NextResponse.json(
        { error: 'Invalid address format.', requestId: correlationId },
        { status },
      )
    }

    try {
      const membership = await resilientCall(() => fetchMembershipByWallet(address), {
        key: 'membership',
      })
      status = 200
      return NextResponse.json(membership)
    } catch (error) {
      errorMessage = safeErrorMessage(error)

      if (error instanceof CircuitOpenError) {
        status = 503
        return NextResponse.json(
          {
            error: 'Integration gateway temporarily unavailable (circuit open).',
            requestId: correlationId,
          },
          { status },
        )
      }
      if (error instanceof GatewayConfigurationError) {
        status = 503
        return NextResponse.json(
          { error: 'Integration gateway misconfigured.', requestId: correlationId },
          { status },
        )
      }
      if (error instanceof GatewayDependencyError) {
        status = 503
        return NextResponse.json(
          {
            error: 'Integration gateway unavailable: missing optional dependency.',
            requestId: correlationId,
          },
          { status },
        )
      }
      if (error instanceof GatewayMethodError) {
        status = 503
        return NextResponse.json(
          {
            error: 'Integration gateway unavailable: unsupported client method.',
            requestId: correlationId,
          },
          { status },
        )
      }

      status = 502
      return NextResponse.json(
        {
          error: 'Unable to fetch membership information due to an internal error.',
          requestId: correlationId,
        },
        { status },
      )
    }
  } finally {
    logGatewayRequest({
      correlationId,
      method: req.method,
      path,
      status,
      durationMs: Date.now() - start,
      rateLimit,
      address: address ?? undefined,
      errorMessage,
    })
  }
}
