import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  mapCommunity,
  mapMembership,
  mapMemberProfile,
  mapMemberRow,
  mapResource,
  mapPolicy,
  mapSession,
  mapWebhookEvent,
  mapVerificationState,
} from '../lib/api/mappers'
import type { MembershipTier } from '../lib/api/types'
import { ApiError } from '../lib/api/errors'

// ===========================================================================
// mapCommunity
// ===========================================================================

describe('mapCommunity', () => {
  it('maps camelCase backend community response', () => {
    const raw: any = { id: 'c1', name: 'Guild', description: 'A guild', tiers: ['free', 'pro'] }
    assert.deepEqual(mapCommunity(raw), {
      id: 'c1',
      name: 'Guild',
      description: 'A guild',
      tiers: ['free', 'pro'] as MembershipTier[],
    })
  })

  it('handles null/undefined raw value with safe defaults', () => {
    const fallback = {
      id: 'unknown',
      name: 'Unknown Community',
      description: '',
      tiers: ['free'] as MembershipTier[],
    }
    assert.deepEqual(mapCommunity(null as any), fallback)
    assert.deepEqual(mapCommunity(undefined as any), fallback)
  })

  it('provides default tiers when missing', () => {
    const raw: any = { id: 'c2', name: 'Test' }
    assert.deepEqual(mapCommunity(raw), {
      id: 'c2',
      name: 'Test',
      description: undefined,
      tiers: ['free', 'standard', 'pro'] as MembershipTier[],
    })
  })
})

// ===========================================================================
// mapMembership
// ===========================================================================

describe('mapMembership', () => {
  it('maps camelCase backend membership response', () => {
    const raw: any = { address: '0xabc', tier: 'gold', active: true, expiresAt: '2027-01-01' }
    assert.deepEqual(mapMembership(raw), {
      address: '0xabc',
      tier: 'gold',
      active: true,
      expiresAt: '2027-01-01',
    })
  })

  it('maps snake_case backend membership response', () => {
    const raw: any = { wallet_address: '0xabc', membership_tier: 'pro', is_active: true, expires_at: '2027-06-01' }
    assert.deepEqual(mapMembership(raw), {
      address: '0xabc',
      tier: 'pro',
      active: true,
      expiresAt: '2027-06-01',
    })
  })

  it('fills fallback defaults when all fields are missing', () => {
    const raw: any = {}
    assert.deepEqual(mapMembership(raw), {
      address: '',
      tier: 'free' as MembershipTier,
      active: false,
      expiresAt: undefined,
    })
  })

  it('prefers camelCase over snake_case when both are present', () => {
    const raw: any = { address: 'camel', wallet_address: 'snake', tier: 'gold', membership_tier: 'free', active: true, is_active: false }
    assert.deepEqual(mapMembership(raw), {
      address: 'camel',
      tier: 'gold',
      active: true,
      expiresAt: undefined,
    })
  })

  it('allows expiresAt to be absent', () => {
    const raw: any = { address: '0xabc', tier: 'free', active: false }
    assert.deepEqual(mapMembership(raw), {
      address: '0xabc',
      tier: 'free' as MembershipTier,
      active: false,
      expiresAt: undefined,
    })
  })
})

// ===========================================================================
// mapMemberProfile
// ===========================================================================

describe('mapMemberProfile', () => {
  it('maps camelCase profile response', () => {
    const raw = { displayName: 'Alice', bio: 'Builder', badges: ['early'] }
    assert.deepEqual(mapMemberProfile(raw, '0xabc'), {
      address: '0xabc',
      displayName: 'Alice',
      bio: 'Builder',
      badges: ['early'],
    })
  })

  it('maps snake_case profile response', () => {
    const raw = { display_name: 'Bob', bio: 'Dev', badges: ['vip'] }
    assert.deepEqual(mapMemberProfile(raw, '0xdef'), {
      address: '0xdef',
      displayName: 'Bob',
      bio: 'Dev',
      badges: ['vip'],
    })
  })

  it('falls back through displayName variants to username', () => {
    assert.deepEqual(mapMemberProfile({ username: 'charlie' }, '0x1'), {
      address: '0x1',
      displayName: 'charlie',
      bio: undefined,
      badges: [],
    })
  })

  it('uses "Unknown" when no display name field is present', () => {
    assert.deepEqual(mapMemberProfile({}, '0x2'), {
      address: '0x2',
      displayName: 'Unknown',
      bio: undefined,
      badges: [],
    })
  })

  it('defaults badges to empty array when missing', () => {
    assert.deepEqual(mapMemberProfile({ displayName: 'D' }, '0x3'), {
      address: '0x3',
      displayName: 'D',
      bio: undefined,
      badges: [],
    })
  })
})

// ===========================================================================
// mapMemberRow
// ===========================================================================

describe('mapMemberRow', () => {
  it('maps camelCase member row', () => {
    const raw = { address: '0xabc', roles: ['admin'], tier: 'pro', active: true }
    assert.deepEqual(mapMemberRow(raw), {
      address: '0xabc',
      roles: ['admin'],
      tier: 'pro',
      active: true,
    })
  })

  it('maps snake_case member row', () => {
    const raw = { wallet_address: '0xdef', roles: ['moderator'], membership_tier: 'standard', is_active: false }
    assert.deepEqual(mapMemberRow(raw), {
      address: '0xdef',
      roles: ['moderator'],
      tier: 'standard',
      active: false,
    })
  })

  it('fills fallback defaults for missing fields', () => {
    assert.deepEqual(mapMemberRow({}), {
      address: '',
      roles: [],
      tier: 'free',
      active: false,
    })
  })
})

// ===========================================================================
// mapResource
// ===========================================================================

describe('mapResource', () => {
  it('maps camelCase resource response', () => {
    const raw = { id: 'r1', title: 'Guide', description: 'How-to', minTier: 'pro', roles: ['admin'] }
    assert.deepEqual(mapResource(raw), {
      id: 'r1',
      title: 'Guide',
      description: 'How-to',
      minTier: 'pro',
      roles: ['admin'],
    })
  })

  it('maps snake_case resource response', () => {
    const raw = { id: 'r2', name: 'Wiki', description: 'Docs', min_tier: 'standard', roles: ['moderator'] }
    assert.deepEqual(mapResource(raw), {
      id: 'r2',
      title: 'Wiki',
      description: 'Docs',
      minTier: 'standard',
      roles: ['moderator'],
    })
  })

  it('falls back to "Untitled" when title and name are missing', () => {
    assert.deepEqual(mapResource({ id: 'r3' }), {
      id: 'r3',
      title: 'Untitled',
      description: undefined,
      minTier: undefined,
      roles: [],
    })
  })
})

// ===========================================================================
// mapPolicy
// ===========================================================================

describe('mapPolicy', () => {
  it('maps camelCase policy response', () => {
    const raw = { resourceId: 'res1', minTier: 'pro', roles: ['admin'] }
    assert.deepEqual(mapPolicy(raw), {
      resourceId: 'res1',
      minTier: 'pro',
      roles: ['admin'],
    })
  })

  it('maps snake_case policy response', () => {
    const raw = { resource_id: 'res2', min_tier: 'standard', roles: ['moderator'] }
    assert.deepEqual(mapPolicy(raw), {
      resourceId: 'res2',
      minTier: 'standard',
      roles: ['moderator'],
    })
  })

  it('fills fallback defaults for missing fields', () => {
    assert.deepEqual(mapPolicy({}), {
      resourceId: '',
      minTier: 'free',
      roles: [],
    })
  })
})

// ===========================================================================
// mapSession
// ===========================================================================

describe('mapSession', () => {
  it('maps camelCase session with nested membership and community', () => {
    const raw = {
      address: '0xabc',
      roles: ['member'],
      membership: { address: '0xabc', tier: 'gold', active: true },
      community: { id: 'c1', name: 'Guild', tiers: ['free', 'pro'] },
    }
    const result = mapSession(raw)
    assert.equal(result.address, '0xabc')
    assert.deepEqual(result.roles, ['member'])
    assert.deepEqual(result.membership, { address: '0xabc', tier: 'gold', active: true, expiresAt: undefined })
    assert.deepEqual(result.community, { id: 'c1', name: 'Guild', description: undefined, tiers: ['free', 'pro'] })
  })

  it('maps snake_case session with nested membership and community', () => {
    const raw = {
      wallet_address: '0xdef',
      roles: ['admin'],
      membership: { wallet_address: '0xdef', membership_tier: 'pro', is_active: true },
      community: { id: 'c2', name: 'Test', tiers: ['standard'] },
    }
    const result = mapSession(raw)
    assert.equal(result.address, '0xdef')
    assert.deepEqual(result.roles, ['admin'])
    assert.deepEqual(result.membership, { address: '0xdef', tier: 'pro', active: true, expiresAt: undefined })
  })

  it('handles missing membership and community gracefully', () => {
    const raw = { address: '0xabc', roles: [] }
    assert.deepEqual(mapSession(raw), {
      address: '0xabc',
      roles: [],
      membership: undefined,
      community: undefined,
    })
  })
})

// ===========================================================================
// mapWebhookEvent
// ===========================================================================

describe('mapWebhookEvent', () => {
  it('maps camelCase webhook event', () => {
    const raw = {
      id: 'evt1',
      eventType: 'membership.created',
      status: 'success',
      timestamp: '2026-06-29T00:00:00Z',
      affectedIdentifier: '0xabc',
      payloadSummary: { network: 'mainnet', txHash: '0xtx', tier: 'gold', reason: 'payment' },
    }
    assert.deepEqual(mapWebhookEvent(raw), {
      id: 'evt1',
      eventType: 'membership.created',
      status: 'success',
      timestamp: '2026-06-29T00:00:00Z',
      affectedIdentifier: '0xabc',
      payloadSummary: { network: 'mainnet', txHash: '0xtx', tier: 'gold', reason: 'payment' },
    })
  })

  it('maps snake_case webhook event', () => {
    const raw = {
      id: 'evt2',
      event_type: 'tier.upgraded',
      status: 'pending',
      created_at: '2026-06-29T01:00:00Z',
      affected_identifier: '0xdef',
      payload_summary: { network: 'testnet', tx_hash: '0xty', tier: 'pro', reason: 'upgrade' },
    }
    assert.deepEqual(mapWebhookEvent(raw), {
      id: 'evt2',
      eventType: 'tier.upgraded',
      status: 'pending',
      timestamp: '2026-06-29T01:00:00Z',
      affectedIdentifier: '0xdef',
      payloadSummary: { network: 'testnet', txHash: '0xty', tier: 'pro', reason: 'upgrade' },
    })
  })

  it('fills fallback defaults for missing fields', () => {
    const result = mapWebhookEvent({})
    assert.equal(result.id, '')
    assert.equal(result.eventType, 'membership.created')
    assert.equal(result.status, 'pending')
    assert.equal(result.affectedIdentifier, '')
    assert.deepEqual(result.payloadSummary, { network: undefined, txHash: undefined, tier: undefined, reason: undefined })
    // timestamp uses new Date().toISOString() so just verify it's a string
    assert.equal(typeof result.timestamp, 'string')
  })

  it('handles missing payloadSummary', () => {
    const result = mapWebhookEvent({ id: 'evt3', eventType: 'policy.updated', status: 'failed' })
    assert.deepEqual(result.payloadSummary, { network: undefined, txHash: undefined, tier: undefined, reason: undefined })
  })
})
// ===========================================================================
// mapVerificationState
// ===========================================================================

describe('mapVerificationState', () => {
  it('returns verified state when data.verified is true', () => {
    const data = { verified: true, checkedAt: '2024-01-01' }
    const result = mapVerificationState(data, null)
    assert.equal(result.status, 'verified')
    assert.equal(result.badgeVariant, 'success')
  })

  it('returns unverified state when data.verified is false', () => {
    const data = { verified: false, checkedAt: '2024-01-01' }
    const result = mapVerificationState(data, null)
    assert.equal(result.status, 'unverified')
    assert.equal(result.badgeVariant, 'warning')
  })

  it('returns unavailable state for 503 errors', () => {
    const error = new ApiError({
      status: 503,
      code: 'server_error',
      safeMessage: 'Gateway unavailable',
    })
    const result = mapVerificationState(undefined, error)
    assert.equal(result.status, 'unavailable')
    assert.equal(result.badgeVariant, 'default')
    assert.equal(result.message, 'Gateway unavailable')
  })

  it('returns unavailable state for network errors', () => {
    const error = new ApiError({
      code: 'network_error',
      safeMessage: 'Network down',
    })
    const result = mapVerificationState(undefined, error)
    assert.equal(result.status, 'unavailable')
    assert.equal(result.badgeVariant, 'default')
  })

  it('returns failed state for other errors (e.g. 502)', () => {
    const error = new ApiError({
      status: 502,
      code: 'server_error',
      safeMessage: 'Bad gateway',
    })
    const result = mapVerificationState(undefined, error)
    assert.equal(result.status, 'failed')
    assert.equal(result.badgeVariant, 'destructive')
    assert.equal(result.message, 'Bad gateway')
  })
})
