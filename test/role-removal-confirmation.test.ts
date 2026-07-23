import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  roleRemovalConfirmationMessage,
  roleRemovalNeedsConfirmation,
} from '../lib/api/role-removal'

test('role removal confirmation is not required for non-sensitive extra roles', () => {
  assert.equal(roleRemovalNeedsConfirmation('moderator', ['member', 'moderator']), false)
  assert.equal(
    roleRemovalConfirmationMessage('0xabc', 'moderator', ['member', 'moderator']),
    null,
  )
})

test('role removal confirmation is required for admin roles', () => {
  assert.equal(roleRemovalNeedsConfirmation('admin', ['member', 'admin']), true)
  assert.equal(
    roleRemovalConfirmationMessage('0xabc', 'admin', ['member', 'admin']),
    'Remove admin role from 0xabc? This removes the admin role.',
  )
})

test('role removal confirmation is required for a member last role', () => {
  assert.equal(roleRemovalNeedsConfirmation('member', ['member']), true)
  assert.equal(
    roleRemovalConfirmationMessage('0xabc', 'member', ['member']),
    "Remove member role from 0xabc? This removes the member's last remaining role.",
  )
})

test('role removal confirmation explains when admin is also the last role', () => {
  assert.equal(
    roleRemovalConfirmationMessage('0xabc', 'admin', ['admin']),
    "Remove admin role from 0xabc? This removes the admin role and the member's last remaining role.",
  )
})
