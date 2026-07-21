import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    return new URL(trimmed).origin
  } catch {
    return null
  }
}

function originFromDomain(domain: string, requestUrl: string): string | null {
  const trimmed = domain.trim()
  if (!trimmed) return null

  if (/^https?:\/\//i.test(trimmed)) {
    return normalizeOrigin(trimmed)
  }

  const requestProtocol = normalizeOrigin(requestUrl)?.split('://')[0] ?? 'https'
  return normalizeOrigin(`${requestProtocol}://${trimmed}`)
}

export function expectedIntegrationGatewayOrigin(requestUrl: string): string | null {
  const configuredOrigin = config.integrationGateway.allowedOrigin
  if (configuredOrigin) {
    return normalizeOrigin(configuredOrigin)
  }

  return originFromDomain(config.siwe.domain, requestUrl)
}

export function validateIntegrationGatewayCsrf(req: NextRequest): NextResponse | null {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return null
  }

  const expectedOrigin = expectedIntegrationGatewayOrigin(req.url)
  if (!expectedOrigin) {
    return NextResponse.json(
      { error: 'Integration gateway CSRF protection is misconfigured.' },
      { status: 503 },
    )
  }

  const origin = normalizeOrigin(req.headers.get('origin') ?? '')
  if (origin) {
    if (origin === expectedOrigin) return null

    return NextResponse.json(
      { error: 'Cross-origin requests are not allowed for integration gateway mutations.' },
      { status: 403 },
    )
  }

  const refererHeader = req.headers.get('referer')
  const refererOrigin = refererHeader ? normalizeOrigin(refererHeader) : null
  if (refererHeader && refererOrigin !== expectedOrigin) {
    return NextResponse.json(
      { error: 'Cross-origin requests are not allowed for integration gateway mutations.' },
      { status: 403 },
    )
  }

  return null
}
