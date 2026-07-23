import './setup-env'
import { describe, test, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { NextResponse, NextRequest } from 'next/server'

// We need to dynamically load/reload modules to toggle the feature flag environment
function resetConfigModules() {
  delete require.cache[require.resolve('../lib/config')]
  delete require.cache[require.resolve('../lib/features')]
  delete require.cache[require.resolve('../lib/query/query-keys')]
}

describe('Multi-Community Scoping and Routing Tests', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    resetConfigModules()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    resetConfigModules()
  })

  test('Query keys include community slug when multiCommunity is enabled', () => {
    process.env.NEXT_PUBLIC_FEATURE_MULTI_COMMUNITY = 'true'
    const { queryKeys } = require('../lib/query/query-keys')

    // Scoped keys with community id/slug
    assert.deepEqual(queryKeys.session.byAddress('0xabc', 'builders-collective'), [
      'session',
      '0xabc',
      'builders-collective',
    ])
    assert.deepEqual(queryKeys.members.all('builders-collective'), [
      'members',
      'builders-collective',
    ])
    assert.deepEqual(queryKeys.policies.all('builders-collective'), [
      'policies',
      'builders-collective',
    ])
    assert.deepEqual(queryKeys.policies.byResource('res123', 'builders-collective'), [
      'policy',
      'res123',
      'builders-collective',
    ])
    assert.deepEqual(queryKeys.resources.all('builders-collective'), [
      'resources',
      'builders-collective',
    ])
    assert.deepEqual(queryKeys.resources.detail('res456', 'builders-collective'), [
      'resource',
      'res456',
      'builders-collective',
    ])
    assert.deepEqual(queryKeys.community.all('builders-collective'), [
      'community',
      'builders-collective',
    ])
    assert.deepEqual(queryKeys.profile.byAddress('0xdef', 'builders-collective'), [
      'profile',
      '0xdef',
      'builders-collective',
    ])
    assert.deepEqual(queryKeys.walletVerification.byAddress('0xghi', 'builders-collective'), [
      'walletVerification',
      '0xghi',
      'builders-collective',
    ])
    assert.deepEqual(queryKeys.webhookEvents.all('builders-collective'), [
      'webhookEvents',
      'builders-collective',
    ])
    assert.deepEqual(queryKeys.analytics.summary('builders-collective'), [
      'analytics',
      'summary',
      'builders-collective',
    ])
  })

  test('Query keys fall back to no community slug when multiCommunity is disabled', () => {
    process.env.NEXT_PUBLIC_FEATURE_MULTI_COMMUNITY = 'false'
    const { queryKeys } = require('../lib/query/query-keys')

    // Scoped keys without community slug
    assert.deepEqual(queryKeys.session.byAddress('0xabc', 'builders-collective'), [
      'session',
      '0xabc',
    ])
    assert.deepEqual(queryKeys.members.all('builders-collective'), ['members'])
    assert.deepEqual(queryKeys.policies.all('builders-collective'), ['policies'])
    assert.deepEqual(queryKeys.policies.byResource('res123', 'builders-collective'), [
      'policy',
      'res123',
    ])
    assert.deepEqual(queryKeys.resources.all('builders-collective'), ['resources'])
    assert.deepEqual(queryKeys.resources.detail('res456', 'builders-collective'), [
      'resource',
      'res456',
    ])
    assert.deepEqual(queryKeys.community.all('builders-collective'), ['community'])
    assert.deepEqual(queryKeys.profile.byAddress('0xdef', 'builders-collective'), [
      'profile',
      '0xdef',
    ])
    assert.deepEqual(queryKeys.walletVerification.byAddress('0xghi', 'builders-collective'), [
      'walletVerification',
      '0xghi',
    ])
    assert.deepEqual(queryKeys.webhookEvents.all('builders-collective'), ['webhookEvents'])
    assert.deepEqual(queryKeys.analytics.summary('builders-collective'), ['analytics', 'summary'])
  })

  test('Global SIWE Session behavior - Session persists across community switch without re-auth', async () => {
    process.env.NEXT_PUBLIC_FEATURE_MULTI_COMMUNITY = 'true'
    const { MockAccessApi } = require('../lib/api/mock')
    
    const address = '0x1234567890123456789012345678901234567890'
    
    // Instantiate APIs for two different communities
    const apiA = new MockAccessApi(address, 'builders-collective')
    const apiB = new MockAccessApi(address, 'design-guild')

        // SIWE Verification yields a valid token
    const nonce = await apiA.getNonce(address)
    const message = `localhost:3000 wants you to sign in with your Ethereum account:\n${address}\n\nSign in to GuildPass Admin.\n\nURI: https://localhost:3000\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: 2025-01-01T00:00:00.000Z`
    const signature = '0xsignature'
    
    const sessionA = await apiA.siweVerify(message, signature)
    assert.ok(sessionA.token)
    assert.ok(sessionA.isAuthenticated)
    assert.equal(sessionA.address, address)

    // Using the same authentication credentials (address), get the session for community A
    const sessionDataA = await apiA.getSession()
    assert.equal(sessionDataA.address, address)
    assert.equal(sessionDataA.community.id, 'builders-collective')
    assert.deepEqual(sessionDataA.roles, ['member']) // seeded mock role

    // Switch community to community B. We use the exact same credentials (address & token)
    // without performing a new siweVerify. Global session is maintained.
    const apiBSession = new MockAccessApi(address, 'design-guild')
    const sessionDataB = await apiBSession.getSession()
    
    // Verifying that the session persists without throwing or needing re-auth
    assert.equal(sessionDataB.address, address)
    assert.equal(sessionDataB.community.id, 'design-guild')
    assert.deepEqual(sessionDataB.roles, ['member'])
    
    // Confirm data isolation: data returned for A does not mix with B
    const profileA = await apiA.getProfile(address)
    const profileB = await apiB.getProfile(address)
    
    assert.notEqual(profileA, null)
    assert.notEqual(profileB, null)
    assert.equal(profileA!.displayName, 'Collective Builder')
    assert.equal(profileB!.displayName, 'Guild Designer')
  })

  test('Data Isolation: Mock API isolates resources and policies by communityId', async () => {
    const { MockAccessApi } = require('../lib/api/mock')
    
    const apiA = new MockAccessApi(undefined, 'builders-collective')
    const apiB = new MockAccessApi(undefined, 'design-guild')

    const resourcesA = await apiA.listResources()
    const resourcesB = await apiB.listResources()

    // Confirm different resource list length or ids
    assert.ok(resourcesA.some((r: any) => r.id === 'builders-chat'))
    assert.ok(!resourcesB.some((r: any) => r.id === 'builders-chat'))
    assert.ok(resourcesB.some((r: any) => r.id === 'design-portfolio'))
    assert.ok(!resourcesA.some((r: any) => r.id === 'design-portfolio'))

    const policiesA = await apiA.listPolicies()
    const policiesB = await apiB.listPolicies()

    assert.ok(policiesA.some((p: any) => p.resourceId === 'builders-chat'))
    assert.ok(!policiesB.some((p: any) => p.resourceId === 'builders-chat'))
    assert.ok(policiesB.some((p: any) => p.resourceId === 'design-portfolio'))
    assert.ok(!policiesA.some((p: any) => p.resourceId === 'design-portfolio'))
  })
})
