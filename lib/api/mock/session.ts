/**
 * lib/api/mock/session.ts
 *
 * Mock session & SIWE simulation: the cookie-session simulation helpers,
 * nonce handling, and the SIWE endpoints plus the member session read.
 * Extracted from lib/api/mock.ts.
 *
 * Session simulation:
 *  Set NEXT_PUBLIC_MOCK_SESSION_STATE to control the simulated auth boundary:
 *    "expired"         — siweVerify returns an already-expired access token
 *                        with a valid refresh token so renewal can be tested
 *    "unauthenticated" — siweVerify always throws, simulating a backend rejection
 *    (default)         — normal mock behaviour (instant auth, 1-hour token)
 */
import { ApiError } from '../errors'
import type {
  Session,
  SessionStatus,
  SiweAuthSession,
} from '../types'
import {
  ensureAddress,
  getCommunityState,
  initPromise,
  type MockApiContext,
} from './state'

/** Read once at module load so it is stable across renders. */
export const MOCK_SESSION_STATE =
  (typeof process !== 'undefined' &&
    process.env.NEXT_PUBLIC_MOCK_SESSION_STATE) ||
  ''

// ── Mock cookie-session simulation (cookie auth mode) ───────────────────────
//
// There is no real backend in mock mode, so a real httpOnly cookie can't be
// set. This uses a plain, non-httpOnly document.cookie entry to simulate
// "the browser is holding a session cookie" — an honest simulation boundary
// (mock JS genuinely cannot set an httpOnly cookie either). It intentionally
// never touches sessionStorage, so cookie-mode session state is provably
// independent of the bearer-token sessionStorage path in lib/session.ts.
// Only ever written/read when the caller is in cookie auth mode, so
// bearer-mode mock runs get zero new side effects.

const MOCK_SESSION_COOKIE = 'gp_mock_session'

function setMockSessionCookie(address: string, expiresAt: string): void {
  if (typeof document === 'undefined') return
  const value = encodeURIComponent(`${address}|${expiresAt}`)
  document.cookie = `${MOCK_SESSION_COOKIE}=${value}; path=/; SameSite=Lax`
}

function clearMockSessionCookie(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${MOCK_SESSION_COOKIE}=; path=/; Max-Age=0; SameSite=Lax`
}

function readMockSessionCookie(): { address: string; expiresAt: string } | null {
  if (typeof document === 'undefined') return null
  const row = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${MOCK_SESSION_COOKIE}=`))
  if (!row) return null
  const raw = decodeURIComponent(row.slice(MOCK_SESSION_COOKIE.length + 1))
  const [address, expiresAt] = raw.split('|')
  return address && expiresAt ? { address, expiresAt } : null
}

/** Nonce TTL in milliseconds (5 minutes — mirrors siwe-go default). */
const NONCE_TTL_MS = 5 * 60 * 1000

/** Extract the nonce value from an EIP-4361 message string. */
function extractNonceFromMessage(message: string): string | null {
  const match = message.match(/Nonce:\s*(\S+)/)
  return match ? match[1] : null
}

/** Generate a short random hex nonce (16 bytes). */
function randomHex(): string {
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0'),
  ).join('')
}

/** Throw a mock 401 ApiError — mirrors what the live API throws on expired tokens. */
export function throwMockUnauthorized(): never {
  throw new ApiError({
    status: 401,
    code: 'unauthorized',
    safeMessage: 'Session expired. Please sign in again.',
  })
}

/** Member session read: resolves the caller's session for the community. */
export async function mockGetSession(ctx: MockApiContext, _signal?: AbortSignal): Promise<Session> {
  await initPromise
  const MOCK_SESSION_STATE = process.env.NEXT_PUBLIC_MOCK_SESSION_STATE || 'valid'
  const state = getCommunityState(ctx.communityId)
  if (MOCK_SESSION_STATE === 'cleared') {
    return {
      // No authenticated session
      roles: [],
      community: state.community,
    }
  }

  const data = ensureAddress(ctx.address, ctx.communityId)
  return {
    address: ctx.address,
    roles: data ? data.roles : [],
    membership: data ? data.membership : undefined,
    community: state.community,
    ...(data ? { badges: data.profile.badges } : {}),
  }
}

export async function mockGetNonce(ctx: MockApiContext, nonceStore: Map<string, number>, address: string): Promise<string> {
  await initPromise
  const nonce = randomHex()
  nonceStore.set(nonce, Date.now())
  return nonce
}

export async function mockSiweVerify(
  ctx: MockApiContext,
  nonceStore: Map<string, number>,
  message: string,
  _signature: string,
): Promise<SiweAuthSession> {
  await initPromise
  if (MOCK_SESSION_STATE === 'unauthenticated') {
    throwMockUnauthorized()
  }

  const nonce = extractNonceFromMessage(message)
  if (!nonce || !nonceStore.has(nonce)) {
    throw new ApiError({
      status: 400,
      code: 'bad_request',
      safeMessage: 'Nonce not found or already used.',
    })
  }

  const createdAt = nonceStore.get(nonce)!
  if (Date.now() - createdAt > NONCE_TTL_MS) {
    nonceStore.delete(nonce)
    throw new ApiError({
      status: 400,
      code: 'bad_request',
      safeMessage: 'Nonce expired. Please request a new one.',
    })
  }

  nonceStore.delete(nonce)

  const expiresAt =
    MOCK_SESSION_STATE === 'expired'
      ? new Date(Date.now() - 1).toISOString()
      : new Date(Date.now() + 60 * 60 * 1000).toISOString()

  const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const resolvedAddress = ctx.address ?? '0x0000000000000000000000000000000000000000'

  if (ctx.authMode === 'cookie') {
    setMockSessionCookie(resolvedAddress, expiresAt)
  }

  return {
    isAuthenticated: true,
    token: `mock-jwt-${randomHex()}`,
    address: resolvedAddress,
    expiresAt,
    refreshToken: `mock-refresh-${randomHex()}`,
    refreshExpiresAt,
  }
}

export async function mockSiweRefresh(ctx: MockApiContext, refreshToken: string): Promise<SiweAuthSession> {
  await initPromise
  // e2e instrumentation only: mock mode makes no real network request for
  // siweRefresh, so cross-tab race tests need some observable signal for
  // "how many refresh attempts actually happened" per tab.
  if (typeof window !== 'undefined') {
    (window as any).__mockSiweRefreshCalls__ =
      ((window as any).__mockSiweRefreshCalls__ ?? 0) + 1
  }
  if (MOCK_SESSION_STATE === 'expired' || MOCK_SESSION_STATE === 'unauthenticated') {
    throw new ApiError({
      status: 401,
      code: 'unauthorized',
      safeMessage: 'Refresh token expired. Please sign in again.',
    })
  }

  if (ctx.authMode === 'cookie') {
    // Cookie mode has no refresh-token string for the frontend to hold —
    // the (mock) session cookie is the only refreshability signal.
    if (!readMockSessionCookie()) {
      throw new ApiError({
        status: 401,
        code: 'unauthorized',
        safeMessage: 'Invalid refresh token.',
      })
    }
  } else if (!refreshToken || !refreshToken.startsWith('mock-refresh-')) {
    throw new ApiError({
      status: 401,
      code: 'unauthorized',
      safeMessage: 'Invalid refresh token.',
    })
  }

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const resolvedAddress = ctx.address ?? '0x0000000000000000000000000000000000000000'

  if (ctx.authMode === 'cookie') {
    setMockSessionCookie(resolvedAddress, expiresAt)
  }

  return {
    isAuthenticated: true,
    token: `mock-jwt-${randomHex()}`,
    address: resolvedAddress,
    expiresAt,
    refreshToken: `mock-refresh-${randomHex()}`,
    refreshExpiresAt,
  }
}

export async function mockSiweLogout(ctx: MockApiContext, _token?: string): Promise<void> {
  await initPromise
  if (ctx.authMode === 'cookie') {
    clearMockSessionCookie()
  }
}

/**
 * Mock counterpart to LiveAccessApi.getSessionStatus(). Reads only the
 * simulated document.cookie session marker set by siweVerify/siweRefresh —
 * never sessionStorage — so cookie-mode session state stays deterministic
 * and independent of the bearer-token sessionStorage path.
 */
export async function mockGetSessionStatus(ctx: MockApiContext, _signal?: AbortSignal): Promise<SessionStatus> {
  await initPromise
  if (MOCK_SESSION_STATE === 'unauthenticated') {
    return { authenticated: false }
  }
  const cookie = readMockSessionCookie()
  if (!cookie) {
    return { authenticated: false }
  }
  if (MOCK_SESSION_STATE === 'expired' || new Date(cookie.expiresAt).getTime() <= Date.now()) {
    return { authenticated: false }
  }
  return { authenticated: true, address: cookie.address, expiresAt: cookie.expiresAt }
}