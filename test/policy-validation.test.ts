import test from 'node:test'
import assert from 'node:assert/strict'
import { validatePolicy } from '../lib/validation/policy'

test('accepts a valid tier-only policy', () => {
  const result = validatePolicy({
    resourceId: 'alpha_resource',
    minTier: 'standard',
  })

  assert.equal(result.valid, true)
})

test('accepts a valid role-only policy', () => {
  const result = validatePolicy({
    resourceId: 'moderator-panel',
    roles: ['moderator'],
  })

  assert.equal(result.valid, true)
})

test('rejects empty resource ids', () => {
  const result = validatePolicy({
    resourceId: '',
    minTier: 'pro',
  })

  assert.equal(result.valid, false)
  if (!result.valid) {
    assert.ok(result.errors.resourceId)
  }
})

test('rejects malformed resource ids', () => {
  const result = validatePolicy({
    resourceId: 'bad id',
    minTier: 'pro',
  })

  assert.equal(result.valid, false)
  if (!result.valid) {
    assert.ok(result.errors.resourceId)
  }
})

test('rejects duplicate roles', () => {
  const result = validatePolicy({
    resourceId: 'ops-dashboard',
    roles: ['admin', 'admin'],
  })

  assert.equal(result.valid, false)
  if (!result.valid) {
    assert.ok(result.errors.roles)
  }
})

test('rejects policies with no restrictions', () => {
  const result = validatePolicy({
    resourceId: 'public-resource',
  })

  assert.equal(result.valid, false)
  if (!result.valid) {
    assert.ok(result.errors.combination)
  }
})

test('rejects free tier with no role restrictions', () => {
  const result = validatePolicy({
    resourceId: 'open-resource',
    minTier: 'free',
  })

  assert.equal(result.valid, false)
  if (!result.valid) {
    assert.ok(result.errors.combination)
  }
})
