import './setup-env'
import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import { queryKeys } from '../lib/query'

test('queryKeys generate correct static keys', () => {
  assert.deepEqual(queryKeys.session.all, ['session'])
  assert.deepEqual(queryKeys.members.all(), ['members'])
  assert.deepEqual(queryKeys.policies.all(), ['policies'])
  assert.deepEqual(queryKeys.resources.all(), ['resources'])
  assert.deepEqual(queryKeys.community.all(), ['community'])
  assert.deepEqual(queryKeys.profile.all, ['profile'])
  assert.deepEqual(queryKeys.walletVerification.all, ['walletVerification'])
  assert.deepEqual(queryKeys.webhookEvents.all(), ['webhookEvents'])
})

test('queryKeys generate correct scoped keys', () => {
  assert.deepEqual(queryKeys.session.byAddress('0xabc'), ['session', '0xabc'])
  assert.deepEqual(queryKeys.profile.byAddress('0xdef'), ['profile', '0xdef'])
  assert.deepEqual(queryKeys.walletVerification.byAddress('0xghi'), ['walletVerification', '0xghi'])
  assert.deepEqual(queryKeys.policies.byResource('res123'), ['policy', 'res123'])
  assert.deepEqual(queryKeys.resources.detail('res456'), ['resource', 'res456'])
})
