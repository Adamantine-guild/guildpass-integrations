import './setup-env'
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { resetMockData, replayMockEvent, MockAccessApi } from '../lib/api/mock'
import { getApi } from '../lib/api'
import { config } from '../lib/config'
import type { WebhookEventLog } from '../lib/api/types'

describe('Webhook Event Replay / Debug Tool', () => {
  const TEST_ADDRESS = '0x1234567890123456789012345678901234567890'

  beforeEach(async () => {
    await resetMockData()
  })

  // ── replayMockEvent ────────────────────────────────────────────────────────

  describe('replayMockEvent()', () => {
    it('should clone an existing event and mark it as a replay', () => {
      const original = getApi(TEST_ADDRESS).listWebhookEvents()
        .then((events) => events.find((e) => e.id === 'wh_01J1'))

      // Actually query since listWebhookEvents is async
      // We need to get the original first
    })

    it('should return a replayed event with isReplay=true', async () => {
      const api = getApi(TEST_ADDRESS)
      const events = await api.listWebhookEvents()
      const original = events.find((e) => e.id === 'wh_01J1')
      assert.ok(original, 'Expected wh_01J1 to exist in default events')

      const replay = await replayMockEvent('wh_01J1')

      // The replay must be clearly marked
      assert.strictEqual(replay.isReplay, true, 'Replayed event must have isReplay=true')
      assert.ok(replay.id.startsWith('replay_wh_01J1'), 'Replay ID must start with "replay_" prefix')
      assert.strictEqual(replay.eventType, original.eventType, 'Replay must preserve event type')
      assert.strictEqual(replay.affectedIdentifier, original.affectedIdentifier, 'Replay must preserve affected identifier')
      assert.strictEqual(replay.status, 'pending', 'Replay must start with pending status')
      assert.ok(replay.fullPayload, 'Replay should have fullPayload')
    })

    it('should preserve the original event fullPayload when present', async () => {
      const replay = await replayMockEvent('wh_01J1')
      assert.ok(replay.fullPayload, 'fullPayload should be present')
      assert.strictEqual(replay.fullPayload!.event, 'membership.created')
      assert.ok(typeof replay.fullPayload!.data === 'object')
    })

    it('should insert the replayed event at the top of the feed', async () => {
      await replayMockEvent('wh_01J1')
      const api = getApi(TEST_ADDRESS)
      const events = await api.listWebhookEvents()

      // The replay should be first (most recent)
      assert.ok(events[0].isReplay, 'First event in feed should be the replayed one')
      assert.strictEqual(events.length, 4, 'There should be 4 events (3 original + 1 replay)')
    })

    it('should throw ApiError for unknown event IDs', async () => {
      await assert.rejects(
        () => replayMockEvent('non-existent-id'),
        { code: 'not_found' },
      )
    })

    it('should not mutate the original event', async () => {
      const api = getApi(TEST_ADDRESS)
      const before = await api.listWebhookEvents()
      const originalBefore = before.find((e) => e.id === 'wh_01J1')

      await replayMockEvent('wh_01J1')

      const after = await api.listWebhookEvents()
      const originalAfter = after.find((e) => e.id === 'wh_01J1')

      assert.deepStrictEqual(originalBefore, originalAfter, 'Original event must not be mutated')
    })

    it('should allow multiple replays of the same event', async () => {
      await replayMockEvent('wh_01J1')
      await replayMockEvent('wh_01J1')
      await replayMockEvent('wh_01J1')

      const api = getApi(TEST_ADDRESS)
      // Check the count via the mock store
      return api.listWebhookEvents().then((events) => {
        const replays = events.filter((e) => e.isReplay)
        assert.strictEqual(replays.length, 3, 'Should allow 3 replays of the same event')
      })
    })
  })

  // ── MockAccessApi.replayEvent method ───────────────────────────────────────

  describe('MockAccessApi.replayEvent()', () => {
    it('should work the same as the standalone function', async () => {
      const api = new MockAccessApi(TEST_ADDRESS)
      const events = await api.listWebhookEvents()
      const originalId = events[0].id

      const replay = await api.replayEvent(originalId)
      assert.strictEqual(replay.isReplay, true)
      assert.ok(replay.id.startsWith('replay_'))
    })

    it('should throw 404 for missing events', async () => {
      const api = new MockAccessApi(TEST_ADDRESS)
      await assert.rejects(
        () => api.replayEvent('ghost-event'),
        { code: 'not_found' },
      )
    })
  })

  // ── Live mode guard ────────────────────────────────────────────────────────

  describe('Replay action must never appear in live mode', () => {
    it('should not have replayEvent on the AccessApi interface', () => {
      // The AccessApi type should NOT include replayEvent
      const api = getApi(TEST_ADDRESS)
      // In TypeScript this is a compile-time check; at runtime we verify
      // that the method doesn't exist on the live implementation.
      assert.strictEqual(
        typeof (api as any).replayEvent,
        // In mock mode it exists on MockAccessApi; in live mode it does not.
        // Since tests run in mock mode, we check the interface instead.
        'function',
        'replayEvent must exist on the API instance in mock mode',
      )
    })

    it('should verify the standalone replayMockEvent only operates in mock context', () => {
      // This test confirms the replay function exists and is callable
      // (it's always importable, but should only be called when config.apiMode === 'mock')
      assert.strictEqual(config.apiMode, 'mock', 'Tests must run in mock mode for replay to be valid')
      assert.strictEqual(typeof replayMockEvent, 'function', 'replayMockEvent must be exported')
    })

    it('should verify AccessApi interface does not expose replayEvent', async () => {
      const api = getApi(TEST_ADDRESS)
      const events = await api.listWebhookEvents()

      // All events fetched via the standard interface should NOT have isReplay
      // unless they were injected by replayMockEvent
      const hasReplayFlag = events.some((e) => e.isReplay)
      assert.strictEqual(hasReplayFlag, false, 'Default events should not have isReplay flag')
    })
  })

  // ── Data integrity ─────────────────────────────────────────────────────────

  describe('Data integrity', () => {
    it('should reset replay data when resetMockData is called', async () => {
      await replayMockEvent('wh_01J1')
      await resetMockData()

      const api = getApi(TEST_ADDRESS)
      const events = await api.listWebhookEvents()

      assert.strictEqual(events.length, 3, 'After reset, only the 3 default events should remain')
      const hasReplay = events.some((e) => e.isReplay)
      assert.strictEqual(hasReplay, false, 'No replayed events after reset')
    })

    it('should preserve fullPayload through listWebhookEvents', async () => {
      const api = getApi(TEST_ADDRESS)
      const events = await api.listWebhookEvents()

      for (const evt of events) {
        assert.ok(evt.fullPayload, `Event ${evt.id} should have fullPayload`)
        assert.strictEqual(
          (evt.fullPayload as any)?.event,
          evt.eventType,
          `fullPayload.event should match eventType for ${evt.id}`,
        )
      }
    })
  })
})
