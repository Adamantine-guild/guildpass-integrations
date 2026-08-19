import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  applyMockScenario,
  replayMockEvent,
  resetMockData,
  setMockMetaVersion,
  setMockRoleMutationFailure,
} from '../lib/api'

test('the API boundary exposes the application mock controls', () => {
  assert.equal(typeof applyMockScenario, 'function')
  assert.equal(typeof replayMockEvent, 'function')
  assert.equal(typeof resetMockData, 'function')
  assert.equal(typeof setMockMetaVersion, 'function')
  assert.equal(typeof setMockRoleMutationFailure, 'function')
})

