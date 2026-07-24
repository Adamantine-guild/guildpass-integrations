import './setup-env'
import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { MockAccessApi, resetMockData } from '../lib/api/mock'
import { isApiError } from '../lib/api/errors'
import { ProfileValidationError } from '../lib/validation/profile'

const ADDRESS = '0xabcabcabcabcabcabcabcabcabcabcabcabcabc'
const OTHER_ADDRESS = '0x1111111111111111111111111111111111111111'

describe('MockAccessApi.updateProfile', () => {
  beforeEach(async () => {
    await resetMockData()
  })

  test("updates the caller's own profile and is reflected by a subsequent getProfile", async () => {
    const api = new MockAccessApi(ADDRESS)
    await api.updateProfile({
      address: ADDRESS,
      displayName: 'Ada',
      bio: 'Builder',
      avatar: 'https://example.com/avatar.png',
      socialLinks: [{ platform: 'github', url: 'https://example.com/github/ada' }],
      badges: [],
    })

    const profile = await api.getProfile(ADDRESS)
    assert.equal(profile?.displayName, 'Ada')
    assert.equal(profile?.bio, 'Builder')
    assert.equal(profile?.avatar, 'https://example.com/avatar.png')
    assert.deepEqual(profile?.socialLinks, [
      { platform: 'github', url: 'https://example.com/github/ada' },
    ])
  })

  test('preserves existing badges regardless of what the caller submits', async () => {
    const api = new MockAccessApi(ADDRESS)
    const before = await api.getProfile(ADDRESS)
    assert.ok(before)
    assert.ok(before!.badges.length > 0) // ensureAddress seeds default badges

    await api.updateProfile({
      address: ADDRESS,
      displayName: 'Ada',
      badges: ['Fake Admin Badge'],
    })

    const after = await api.getProfile(ADDRESS)
    assert.deepEqual(after?.badges, before?.badges)
  })

  test('rejects updates to another address (403)', async () => {
    const api = new MockAccessApi(OTHER_ADDRESS)
    await assert.rejects(
      () => api.updateProfile({ address: ADDRESS, displayName: 'Eve', badges: [] }),
      (err: unknown) => isApiError(err) && err.status === 403,
    )
  })

  test('rejects when no address is bound to the client', async () => {
    const api = new MockAccessApi()
    await assert.rejects(
      () => api.updateProfile({ address: ADDRESS, displayName: 'Eve', badges: [] }),
      (err: unknown) => isApiError(err) && err.status === 403,
    )
  })

  test('rejects invalid input with a ProfileValidationError', async () => {
    const api = new MockAccessApi(ADDRESS)
    await assert.rejects(
      () => api.updateProfile({ address: ADDRESS, avatar: 'not-a-url', badges: [] }),
      (err: unknown) => err instanceof ProfileValidationError && !!err.errors.avatar,
    )
  })

  test('trims fields and normalizes blank optional values to unset', async () => {
    const api = new MockAccessApi(ADDRESS)
    await api.updateProfile({
      address: ADDRESS,
      displayName: '  Ada  ',
      bio: '   ',
      badges: [],
    })

    const profile = await api.getProfile(ADDRESS)
    assert.equal(profile?.displayName, 'Ada')
    assert.equal(profile?.bio, undefined)
  })
})
