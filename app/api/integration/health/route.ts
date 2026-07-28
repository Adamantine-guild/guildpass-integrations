import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import {
  isGatewayConfigured,
  isGatewayDependencyAvailable,
  isGatewayMethodSupported,
} from '@/lib/integration-client'
import { logGatewayRequest } from '@/lib/observability/request-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Health check for the optional integration gateway.
 * Reports configuration status without exposing secrets.
 */
export async function GET() {
  const start = Date.now()
  const correlationId = randomUUID()
  let status = 500

  try {
    const configured = isGatewayConfigured()
    const dependencyAvailable = configured ? isGatewayDependencyAvailable() : false
    const methodSupported = dependencyAvailable ? isGatewayMethodSupported() : false
    const healthy = configured && dependencyAvailable && methodSupported
    status = healthy ? 200 : 503

    return NextResponse.json(
      {
        status: healthy ? 'ok' : 'degraded',
        checks: {
          apiKeyConfigured: configured,
          dependencyAvailable,
          methodSupported,
        },
        requestId: correlationId,
      },
      { status },
    )
  } finally {
    logGatewayRequest({
      correlationId,
      method: 'GET',
      path: '/api/integration/health',
      status,
      durationMs: Date.now() - start,
      rateLimit: 'not_applicable',
    })
  }
}
