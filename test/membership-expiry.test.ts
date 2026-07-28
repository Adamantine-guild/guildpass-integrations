import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  MEMBERSHIP_EXPIRY_BADGE_VARIANTS,
  MEMBERSHIP_EXPIRY_SOON_THRESHOLD_DAYS,
  MEMBERSHIP_EXPIRY_STATUS_LABELS,
  getMembershipExpiryStatus,
} from '../lib/membership-expiry'

const now = '2026-07-19T00:00:00.000Z'
const dayMs = 24 * 60 * 60 * 1000
const nowMs = new Date(now).getTime()

test('marks memberships far from expiry as active', () => {
  const expiresAt = new Date(
    nowMs + (MEMBERSHIP_EXPIRY_SOON_THRESHOLD_DAYS + 1) * dayMs,
  )

  assert.equal(getMembershipExpiryStatus(expiresAt, now), 'active')
})

test('marks memberships within the configured threshold as expiring soon', () => {
  const expiresAt = new Date(nowMs + MEMBERSHIP_EXPIRY_SOON_THRESHOLD_DAYS * dayMs)

  assert.equal(getMembershipExpiryStatus(expiresAt, now), 'expiringSoon')
})

test('marks memberships before or at the current time as expired', () => {
  assert.equal(getMembershipExpiryStatus(now, now), 'expired')
  assert.equal(getMembershipExpiryStatus(new Date(nowMs - dayMs), now), 'expired')
})

test('maps each expiry status to a distinct label and badge variant', () => {
  const statuses = ['active', 'expiringSoon', 'expired'] as const
  const labels = statuses.map((status) => MEMBERSHIP_EXPIRY_STATUS_LABELS[status])
  const variants = statuses.map((status) => MEMBERSHIP_EXPIRY_BADGE_VARIANTS[status])

  assert.equal(new Set(labels).size, statuses.length)
  assert.equal(new Set(variants).size, statuses.length)
})
