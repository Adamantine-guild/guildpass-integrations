import './setup-env'
import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfileForm } from '../components/dashboard/profile-editor'
import type { ProfileValidationErrors } from '../lib/validation/profile'

const ADDRESS = '0xabcabcabcabcabcabcabcabcabcabcabcabcabc'

/**
 * Renders ProfileForm directly with plain props — no QueryClientProvider or
 * SIWE context needed, since (unlike ProfileEditor) the form itself only
 * uses useState/useEffect/useId. Mirrors the direct-render style of
 * admin-guard-a11y.test.tsx.
 */
function renderForm(errors: ProfileValidationErrors = {}): string {
  return renderToStaticMarkup(
    React.createElement(ProfileForm, {
      address: ADDRESS,
      initial: null,
      onSave: () => {},
      onCancel: () => {},
      disabled: false,
      errors,
    }),
  )
}

function allMatches(html: string, pattern: RegExp): string[] {
  return [...html.matchAll(pattern)].map((m) => m[1])
}

describe('ProfileForm accessibility (#254)', () => {
  test('every label targets an id that exists in the rendered form', () => {
    const html = renderForm()
    const labelTargets = allMatches(html, /<label[^>]*\sfor="([^"]+)"/g)
    assert.ok(labelTargets.length >= 3, 'expected at least 3 labelled fields')
    for (const id of labelTargets) {
      assert.match(html, new RegExp(`\\sid="${id}"`), `no element with id="${id}" for a <label for="${id}">`)
    }
  })

  test('social links form a labelled group', () => {
    const html = renderForm()
    assert.match(html, /role="group" aria-labelledby="[^"]+"/)
    const [groupLabelId] = allMatches(html, /role="group" aria-labelledby="([^"]+)"/g)
    assert.match(html, new RegExp(`\\sid="${groupLabelId}"[^>]*>\\s*Social Links`))
  })

  test('the avatar upload stub is disabled and explains why', () => {
    const html = renderForm()
    assert.match(html, /Upload image \(coming soon\)/)
    assert.match(html, /disabled=""[^>]*title="Avatar upload is not available yet[^"]*"|title="Avatar upload is not available yet[^"]*"[^>]*disabled=""/)
  })

  test('no error text or aria-invalid is present when there are no errors', () => {
    const html = renderForm()
    assert.doesNotMatch(html, /role="alert"/)
    assert.doesNotMatch(html, /aria-invalid/)
  })

  test('every aria-describedby points at a real role="alert" element, and every field error is announced', () => {
    const errors: ProfileValidationErrors = {
      displayName: 'Display name must be at most 50 characters.',
      bio: 'Bio must be at most 280 characters.',
      avatar: 'Avatar must be a valid http(s) URL.',
      socialLinks: 'Duplicate platforms are not allowed in social links.',
    }
    const html = renderForm(errors)

    // Every field with an error is marked invalid, and every invalid field
    // points at an element that actually exists and announces via role="alert".
    const describedByIds = allMatches(html, /aria-describedby="([^"]+)"/g)
    assert.equal(describedByIds.length, 3) // displayName, bio, avatar (socialLinks has no single input)
    for (const id of describedByIds) {
      const errorElementPattern = new RegExp(`<p id="${id}"[^>]*role="alert"[^>]*>([^<]+)</p>`)
      const match = html.match(errorElementPattern)
      assert.ok(match, `expected a <p id="${id}" role="alert"> element`)
    }

    assert.equal((html.match(/aria-invalid="true"/g) || []).length, 3)
    assert.equal((html.match(/role="alert"/g) || []).length, 4)

    for (const message of Object.values(errors)) {
      assert.ok(html.includes(message!), `expected error message to be rendered: ${message}`)
    }
  })
})
