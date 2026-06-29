import { NextResponse } from 'next/server'
import {
  isGatewayConfigured,
  isGatewayDependencyAvailable,
  isGatewayMethodSupported,
} from '@/lib/integration-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Health check for the optional integration gateway.
 * Reports configuration status without exposing secrets.
 */
export async function GET() {
  const configured = isGatewayConfigured()
  const dependencyAvailable = configured ? isGatewayDependencyAvailable() : false
  const methodSupported = dependencyAvailable ? isGatewayMethodSupported() : false
  const healthy = configured && dependencyAvailable && methodSupported

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      checks: {
        apiKeyConfigured: configured,
        dependencyAvailable,
        methodSupported,
      },
    },
    { status: healthy ? 200 : 503 },
  )
}
