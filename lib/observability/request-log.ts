import { NextResponse } from 'next/server'
import { redactAddress } from '@/lib/wallet/address'

export type RateLimitOutcome = 'allowed' | 'limited' | 'not_applicable'

export interface GatewayRequestLogEntry {
  correlationId: string
  method: string
  path: string
  status: number
  durationMs: number
  rateLimit: RateLimitOutcome
  /** Omit for routes that don't take a wallet address (e.g. health). */
  address?: string
  /** Safe, redacted error summary — never the raw error object or stack. */
  errorMessage?: string
}

/**
 * Emits exactly one structured JSON log line for a gateway request.
 * Callers are expected to invoke this from a `finally` block wrapping the
 * entire handler so every return path — including CSRF/rate-limit
 * early-returns — produces a line.
 */
export function logGatewayRequest(entry: GatewayRequestLogEntry): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      correlationId: entry.correlationId,
      method: entry.method,
      path: entry.path,
      status: entry.status,
      durationMs: entry.durationMs,
      rateLimit: entry.rateLimit,
      address: entry.address !== undefined ? redactAddress(entry.address) : undefined,
      errorMessage: entry.errorMessage,
    }),
  )
}

/**
 * Extracts the message from a caught error without exposing the raw error
 * object, its stack, or any custom properties it may carry.
 */
export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Unknown error'
}

/**
 * Returns a copy of a JSON NextResponse with `requestId` merged into the
 * body, preserving the original status. Used for responses (like the CSRF
 * rejection) that are constructed outside the route handler.
 */
export async function withRequestId(
  response: NextResponse,
  correlationId: string,
): Promise<NextResponse> {
  const body = await response.json().catch(() => null)
  if (body && typeof body === 'object') {
    return NextResponse.json({ ...body, requestId: correlationId }, { status: response.status })
  }
  return response
}
