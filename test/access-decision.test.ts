import './setup-env'
import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import { computeAccessDecision } from '../lib/api/access-decision'
import { accessKeys, ACCESS_DECISION_STALE_TIME, ACCESS_DECISION_GC_TIME } from '../lib/query'
import type { AccessDecision, MembershipTier, Role, Session } from '../lib/api/types'

const standardSession: Session = {
  address: '0xabc',
  roles: ['member'],
  membership: {
    address: '0xabc',
    tier: 'standard',
    active: true,
  },
}

const proSession: Session = {
  address: '0xabc',
  roles: ['admin', 'moderator'],
  membership: {
    address: '0xabc',
    tier: 'pro',
    active: true,
  },
}

const freeSession: Session = {
  address: '0xabc',
  roles: ['member'],
  membership: {
    address: '0xabc',
    tier: 'free',
    active: true,
  },
}

const inactiveSession: Session = {
  address: '0xabc',
  roles: ['member'],
  membership: {
    address: '0xabc',
    tier: 'pro',
    active: false,
  },
}

// ── computeAccessDecision ─────────────────────────────────────────────────────

test('allows access when tier requirement is met', () => {
  const result = computeAccessDecision(standardSession, { minTier: 'free' })
  assert.equal(result.allowed, true)
  assert.equal(typeof result.reason, 'string')
  assert.equal(typeof result.checkedAt, 'string')
})

test('allows access when tier matches exactly', () => {
  const result = computeAccessDecision(standardSession, { minTier: 'standard' })
  assert.equal(result.allowed, true)
})

test('denies access when tier is below minimum', () => {
  const result = computeAccessDecision(freeSession, { minTier: 'standard' })
  assert.equal(result.allowed, false)
  assert.equal(result.reason.length > 0, true)
})

test('allows access when user has required role', () => {
  const result = computeAccessDecision(proSession, { roles: ['admin'] })
  assert.equal(result.allowed, true)
})

test('allows access when user has one of the required roles', () => {
  const result = computeAccessDecision(standardSession, { roles: ['moderator', 'member'] })
  assert.equal(result.allowed, true)
})

test('denies access when user lacks required roles', () => {
  const result = computeAccessDecision(standardSession, { roles: ['admin'] })
  assert.equal(result.allowed, false)
  assert.equal(result.reason.length > 0, true)
})

test('denies access when membership is inactive', () => {
  const result = computeAccessDecision(inactiveSession, { minTier: 'free' })
  assert.equal(result.allowed, false)
})

test('denies access when session is undefined', () => {
  const result = computeAccessDecision(undefined, { minTier: 'standard' })
  assert.equal(result.allowed, false)
})

test('denies access when session has no membership', () => {
  const result = computeAccessDecision({ address: '0xabc', roles: [] }, { minTier: 'free' })
  assert.equal(result.allowed, false)
})

test('allows access when no requirements are set', () => {
  const result = computeAccessDecision(standardSession, {})
  assert.equal(result.allowed, true)
})

// ── Reason metadata ──────────────────────────────────────────────────────────

test('denied result includes safe reason metadata', () => {
  const result = computeAccessDecision(freeSession, { minTier: 'pro' })
  assert.equal(result.allowed, false)
  assert.equal(typeof result.reason, 'string')
  assert.equal(result.reason.length > 0, true)
  assert.equal(result.reason.includes('token'), false)
  assert.equal(result.reason.includes('secret'), false)
})

test('allowed result includes safe reason metadata', () => {
  const result = computeAccessDecision(proSession, { minTier: 'standard', roles: ['admin'] })
  assert.equal(result.allowed, true)
  assert.equal(typeof result.reason, 'string')
  assert.equal(result.reason.length > 0, true)
})

// ── checkedAt timestamp ──────────────────────────────────────────────────────

test('checkedAt is a valid ISO timestamp', () => {
  const result = computeAccessDecision(standardSession, { minTier: 'free' })
  const parsed = new Date(result.checkedAt)
  assert.equal(isNaN(parsed.getTime()), false)
  assert.equal(parsed.getTime() <= Date.now(), true)
})

// ── Query key factory ─────────────────────────────────────────────────────────

test('access keys scope all access queries', () => {
  assert.deepEqual(accessKeys.all, ['access'])
})

test('access keys include env and address for decisions prefix', () => {
  const key = accessKeys.decisions('1', '0xabc')
  assert.deepEqual(key, ['access', '1', 'decision', '0xabc'])
})

test('access keys include env, address, and resourceId for a specific decision', () => {
  const key = accessKeys.decision('1', '0xabc', 'alpha')
  assert.deepEqual(key, ['access', '1', 'decision', '0xabc', 'alpha'])
})

test('decision keys from different addresses produce different keys', () => {
  const a = accessKeys.decision('1', '0xabc', 'alpha')
  const b = accessKeys.decision('1', '0xdef', 'alpha')
  assert.notDeepEqual(a, b)
})

test('decision keys from different resources produce different keys', () => {
  const a = accessKeys.decision('1', '0xabc', 'alpha')
  const b = accessKeys.decision('1', '0xabc', 'pro-reports')
  assert.notDeepEqual(a, b)
})

test('decision keys from different environments produce different keys', () => {
  const a = accessKeys.decision('1', '0xabc', 'alpha')
  const b = accessKeys.decision('11155111', '0xabc', 'alpha')
  assert.notDeepEqual(a, b)
})

// ── Cache configuration constants ─────────────────────────────────────────────

test('cache stale time is 30 seconds', () => {
  assert.equal(ACCESS_DECISION_STALE_TIME, 30_000)
})

test('cache gc time is 5 minutes', () => {
  assert.equal(ACCESS_DECISION_GC_TIME, 5 * 60 * 1000)
})
