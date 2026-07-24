import test from 'node:test'
import assert from 'node:assert/strict'
import { mapServerValidationErrors, validateProfile, ProfileValidationError } from '../lib/validation/profile'
import { ApiError } from '../lib/api/errors'
import type { MemberProfile } from '../lib/api/types'

const BASE: MemberProfile = { address: '0xabc', badges: [] }

test('valid submission: validateProfile accepts good input and mapServerValidationErrors has nothing to map', () => {
  const result = validateProfile({ ...BASE, displayName: 'Ada', bio: 'Builder' })
  assert.equal(result.valid, true)

  // No error was thrown for a valid submission, so there is nothing for the
  // mutation's onError handler to map — mirrors the real call site, which
  // only invokes mapServerValidationErrors when the mutation actually fails.
  assert.deepEqual(mapServerValidationErrors(undefined), {})
})

test('invalid submission: a ProfileValidationError maps straight through onto field errors', () => {
  const result = validateProfile({ ...BASE, avatar: 'not-a-url' })
  assert.equal(result.valid, false)
  if (result.valid) return

  const err = new ProfileValidationError(result.errors)
  const mapped = mapServerValidationErrors(err)
  assert.equal(mapped.avatar, result.errors.avatar)
  assert.equal(Object.keys(mapped).length, 1)
})

test('maps a live-backend 422 validation_error onto field errors using snake_case detail keys', () => {
  const err = new ApiError({
    status: 422,
    code: 'validation_error',
    safeMessage: 'Some of the submitted data is invalid.',
    details: {
      display_name: 'Display name is already taken.',
      social_links: ['Duplicate platform: twitter'],
    },
  })

  const mapped = mapServerValidationErrors(err)
  assert.equal(mapped.displayName, 'Display name is already taken.')
  assert.equal(mapped.socialLinks, 'Duplicate platform: twitter')
})

test('maps a live-backend 422 validation_error using camelCase detail keys too', () => {
  const err = new ApiError({
    status: 422,
    code: 'validation_error',
    safeMessage: 'Some of the submitted data is invalid.',
    details: { avatarUrl: 'Avatar host is not allowed.' },
  })

  const mapped = mapServerValidationErrors(err)
  assert.equal(mapped.avatar, 'Avatar host is not allowed.')
})

test('ignores unrecognized detail keys instead of throwing', () => {
  const err = new ApiError({
    status: 422,
    code: 'validation_error',
    safeMessage: 'Some of the submitted data is invalid.',
    details: { someUnrelatedField: 'nope' },
  })

  assert.deepEqual(mapServerValidationErrors(err), {})
})

test('returns {} for non-validation errors so callers fall back to a generic message', () => {
  const networkErr = new ApiError({
    code: 'network_error',
    safeMessage: 'Unable to connect.',
    retryable: true,
  })
  assert.deepEqual(mapServerValidationErrors(networkErr), {})

  const authErr = new ApiError({ status: 401, code: 'unauthorized', safeMessage: 'Session expired.' })
  assert.deepEqual(mapServerValidationErrors(authErr), {})

  assert.deepEqual(mapServerValidationErrors(new Error('boom')), {})
  assert.deepEqual(mapServerValidationErrors(null), {})
})

test('a validation_error with no details maps to {} rather than throwing', () => {
  const err = new ApiError({
    status: 422,
    code: 'validation_error',
    safeMessage: 'Some of the submitted data is invalid.',
  })
  assert.deepEqual(mapServerValidationErrors(err), {})
})
