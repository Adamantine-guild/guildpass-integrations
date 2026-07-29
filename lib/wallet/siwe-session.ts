/**
 * lib/wallet/siwe-session.ts
 *
 * Pure state machine for the SIWE admin session, extracted from
 * SiweAuthProvider so the 401 → re-auth → success sequence can be unit
 * tested without React or wagmi.
 *
 * The provider (lib/wallet/providers.tsx) drives this reducer from effects
 * and wallet events; components never import it directly — they read the
 * derived status from SiweAuthContext.
 */

import type { AdminSessionStatus, SiweAuthSession } from '../api/types'
import type { AuthMode } from '../config'

export interface SiweSessionState {
  /** The authenticated session, or null if none is held. */
  authSession: SiweAuthSession | null
  /** True when a held session expired or the backend rejected it with 401. */
  expired: boolean
  /** True while a signature request / verify call is in-flight. */
  isSigningIn: boolean
  /** Human-readable error from the most recent signIn attempt, if any. */
  error: string | null
}

export const initialSiweSessionState: SiweSessionState = {
  authSession: null,
  expired: false,
  isSigningIn: false,
  error: null,
}

export type SiweSessionAction =
  | { type: 'restore'; session: SiweAuthSession }
  | { type: 'sign-in-start' }
  | { type: 'sign-in-success'; session: SiweAuthSession }
  | { type: 'sign-in-error'; message: string }
  | { type: 'refresh-success'; session: SiweAuthSession }
  | { type: 'mark-expired' }
  | { type: 'clear' }

export function siweSessionReducer(
  state: SiweSessionState,
  action: SiweSessionAction,
): SiweSessionState {
  switch (action.type) {
    case 'restore':
      return { ...state, authSession: action.session, expired: false }
    case 'sign-in-start':
      return { ...state, isSigningIn: true, error: null }
    case 'sign-in-success':
      // A successful verify replaces the session AND clears the expired
      // flag, so any inline re-auth banner derived from this state
      // disappears immediately without a page reload.
      return {
        authSession: action.session,
        expired: false,
        isSigningIn: false,
        error: null,
      }
    case 'refresh-success':
      // Silent token renewal — update the session without touching signing state
      return { ...state, authSession: action.session, expired: false, error: null }
    case 'sign-in-error':
      return { ...state, isSigningIn: false, error: action.message }
    case 'mark-expired':
      return { ...state, authSession: null, expired: true, isSigningIn: false }
    case 'clear':
      return initialSiweSessionState
  }
}

/**
 * Derive the granular AdminSessionStatus from reducer state + wallet
 * connectivity.
 *
 * Note the ordering: an expired session stays 'expired' (not
 * 'authenticating') while a re-auth signature is in-flight, so the inline
 * banner remains visible with its "Signing…" button until the new session
 * actually lands.
 */
export function deriveSessionStatus(
  state: SiweSessionState,
  isConnected: boolean,
  now: number = Date.now(),
): AdminSessionStatus {
  if (!isConnected) return 'disconnected'
  const session = state.authSession
  if (session && new Date(session.expiresAt).getTime() > now) {
    return 'authenticated'
  }
  if (state.expired || session) return 'expired'
  if (state.isSigningIn) return 'authenticating'
  return 'connected'
}

export interface SiweMessageFields {
  domain: string
  address: string
  statement: string
  uri: string
  chainId: number
  nonce: string
  issuedAt: string
}

/** Assemble a spec-compliant EIP-4361 message for signing. */
export function buildSiweMessage(fields: SiweMessageFields): string {
  return [
    `${fields.domain} wants you to sign in with your Ethereum account:`,
    fields.address,
    '',
    fields.statement,
    '',
    `URI: ${fields.uri}`,
    'Version: 1',
    `Chain ID: ${fields.chainId}`,
    `Nonce: ${fields.nonce}`,
    `Issued At: ${fields.issuedAt}`,
  ].join('\n')
}

/**
 * Validates a session payload received via BroadcastChannel (or the
 * storage-event fallback) before it is applied to local state.
 *
 * Bearer mode requires a non-empty `token` — identical to the inline check
 * providers.tsx used before this was extracted. Cookie mode never broadcasts
 * a real token (see providers.tsx's session-scrubbing at the sign-in/refresh
 * boundary), so the token check is skipped there; `address`/`expiresAt` are
 * still required in both modes since a payload missing those is malformed
 * regardless of auth mode.
 */
export function isValidBroadcastSession(
  session: Pick<SiweAuthSession, 'token' | 'address' | 'expiresAt'> | null | undefined,
  authMode: AuthMode,
): boolean {
  if (!session) return false
  const tokenOk =
    authMode === 'cookie' ||
    (typeof session.token === 'string' && session.token.trim().length > 0)
  return (
    tokenOk &&
    typeof session.address === 'string' &&
    session.address.trim().length > 0 &&
    typeof session.expiresAt === 'string' &&
    session.expiresAt.trim().length > 0
  )
}
