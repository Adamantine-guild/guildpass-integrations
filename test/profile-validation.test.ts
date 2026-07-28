import test from 'node:test'
import assert from 'node:assert/strict'
import { validateProfile, isHttpUrl, normalizeSocialLinks } from '../lib/validation/profile'
import type { MemberProfile } from '../lib/api/types'

const BASE: MemberProfile = { address: '0xabc', badges: [] }

test('accepts a profile with no optional fields set', () => {
  const result = validateProfile(BASE)
  assert.equal(result.valid, true)
  if (result.valid) {
    assert.equal(result.value.displayName, undefined)
    assert.equal(result.value.bio, undefined)
    assert.equal(result.value.avatar, undefined)
    assert.equal(result.value.socialLinks, undefined)
  }
})

test('accepts valid displayName, bio, and avatar', () => {
  const result = validateProfile({
    ...BASE,
    displayName: 'Ada',
    bio: 'Building things on GuildPass.',
    avatar: 'https://example.com/avatar.png',
  })
  assert.equal(result.valid, true)
})

test('treats whitespace-only optional fields as unset, not an error', () => {
  const result = validateProfile({ ...BASE, displayName: '   ', bio: '  ', avatar: ' ' })
  assert.equal(result.valid, true)
  if (result.valid) {
    assert.equal(result.value.displayName, undefined)
    assert.equal(result.value.bio, undefined)
    assert.equal(result.value.avatar, undefined)
  }
})

test('rejects a displayName over the length limit', () => {
  const result = validateProfile({ ...BASE, displayName: 'x'.repeat(51) })
  assert.equal(result.valid, false)
  if (!result.valid) assert.ok(result.errors.displayName)
})

test('rejects a bio over the length limit', () => {
  const result = validateProfile({ ...BASE, bio: 'x'.repeat(281) })
  assert.equal(result.valid, false)
  if (!result.valid) assert.ok(result.errors.bio)
})

test('rejects a non-http(s) avatar URL', () => {
  const result = validateProfile({ ...BASE, avatar: 'not-a-url' })
  assert.equal(result.valid, false)
  if (!result.valid) assert.ok(result.errors.avatar)
})

test('rejects a javascript: avatar URL', () => {
  const result = validateProfile({ ...BASE, avatar: 'javascript:alert(1)' })
  assert.equal(result.valid, false)
  if (!result.valid) assert.ok(result.errors.avatar)
})

test('accepts valid social links', () => {
  const result = validateProfile({
    ...BASE,
    socialLinks: [
      { platform: 'twitter', url: 'https://twitter.com/example' },
      { platform: 'github', url: 'https://github.com/example' },
    ],
  })
  assert.equal(result.valid, true)
  if (result.valid) {
    assert.equal(result.value.socialLinks?.length, 2)
  }
})

test('rejects a social link with an invalid URL', () => {
  const result = validateProfile({
    ...BASE,
    socialLinks: [{ platform: 'twitter', url: 'not-a-url' }],
  })
  assert.equal(result.valid, false)
  if (!result.valid) assert.ok(result.errors.socialLinks)
})

test('rejects a social link with a blank platform', () => {
  const result = validateProfile({
    ...BASE,
    socialLinks: [{ platform: '  ', url: 'https://example.com' }],
  })
  assert.equal(result.valid, false)
  if (!result.valid) assert.ok(result.errors.socialLinks)
})

test('rejects duplicate platforms (case-insensitive)', () => {
  const result = validateProfile({
    ...BASE,
    socialLinks: [
      { platform: 'Twitter', url: 'https://twitter.com/a' },
      { platform: 'twitter', url: 'https://twitter.com/b' },
    ],
  })
  assert.equal(result.valid, false)
  if (!result.valid) assert.ok(result.errors.socialLinks)
})

test('rejects more than the maximum number of social links', () => {
  const socialLinks = Array.from({ length: 11 }, (_, i) => ({
    platform: `platform-${i}`,
    url: `https://example.com/${i}`,
  }))
  const result = validateProfile({ ...BASE, socialLinks })
  assert.equal(result.valid, false)
  if (!result.valid) assert.ok(result.errors.socialLinks)
})

test('isHttpUrl accepts http and https URLs', () => {
  assert.equal(isHttpUrl('https://example.com'), true)
  assert.equal(isHttpUrl('http://example.com'), true)
})

test('isHttpUrl rejects non-string, other schemes, and overlong values', () => {
  assert.equal(isHttpUrl(undefined), false)
  assert.equal(isHttpUrl(123), false)
  assert.equal(isHttpUrl('ftp://example.com'), false)
  assert.equal(isHttpUrl('https://' + 'a'.repeat(2048)), false)
})

test('normalizeSocialLinks trims, drops blanks, and dedupes case-insensitively', () => {
  const normalized = normalizeSocialLinks([
    { platform: '  Twitter  ', url: '  https://twitter.com/a  ' },
    { platform: 'twitter', url: 'https://twitter.com/b' },
    { platform: '', url: 'https://example.com' },
    { platform: 'github', url: '   ' },
  ])
  assert.deepEqual(normalized, [{ platform: 'Twitter', url: 'https://twitter.com/a' }])
})

test('normalizeSocialLinks returns undefined for an empty or all-blank list', () => {
  assert.equal(normalizeSocialLinks(undefined), undefined)
  assert.equal(normalizeSocialLinks([]), undefined)
  assert.equal(normalizeSocialLinks([{ platform: '', url: '' }]), undefined)
})
