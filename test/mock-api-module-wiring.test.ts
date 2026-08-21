import './setup-env'
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { MockAccessApi } from '../lib/api/mock'
import { getApi } from '../lib/api'

// Regression guard for #382: lib/api/mock.ts previously grew into a single
// 2000+ line file with an unmatched block delimiter, which broke parsing of
// the whole module and, transitively, lib/api/index.ts and components/nav.tsx.
// It has since been split into lib/api/mock/*.ts domain modules aggregated
// by MockAccessApi. This test exercises one method from each domain module
// through the public boundary to catch a future wiring/parse regression.
describe('MockAccessApi module wiring (#382)', () => {
  const TEST_ADDRESS = '0x1234567890123456789012345678901234567890'

  it('lib/api/index.ts imports the mock boundary without a parse error', () => {
    assert.strictEqual(typeof getApi, 'function')
  })

  it('composes every domain module onto a single MockAccessApi instance', async () => {
    const api = new MockAccessApi(TEST_ADDRESS)

    await assert.doesNotReject(api.getMeta())
    await assert.doesNotReject(api.getSession())
    await assert.doesNotReject(api.getCommunity())
    await assert.doesNotReject(api.listMembers())
    await assert.doesNotReject(api.listWebhookEvents())
    await assert.doesNotReject(api.getAnalyticsSummary())
    await assert.doesNotReject(api.getPendingActions())
    await assert.doesNotReject(api.getConnections(TEST_ADDRESS))
    await assert.doesNotReject(api.listReports())
    await assert.doesNotReject(api.listProposals())
    assert.ok(api.analytics)
  })
})
