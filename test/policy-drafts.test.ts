import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import './setup-env'
import {
  clearPolicyDraft,
  loadPolicyDraft,
  storePolicyDraft,
} from '../lib/policy-drafts'

const storage = new Map<string, string>()

Object.defineProperty(globalThis, 'window', {
  value: {
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value) },
      removeItem: (key: string) => { storage.delete(key) },
      clear: () => { storage.clear() },
    },
  },
  configurable: true,
})

const STORAGE_KEY = 'guildpass:policy-drafts'

describe('policy editor drafts', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  test('persists and reloads an in-progress edit by resource id', () => {
    storePolicyDraft('alpha', {
      resourceId: 'alpha',
      minTier: 'pro',
      roles: ['admin'],
    })

    assert.deepEqual(loadPolicyDraft('alpha'), {
      resourceId: 'alpha',
      minTier: 'pro',
      roles: ['admin'],
    })
  })

  test('uses a stable key for new policy drafts across remounts', () => {
    storePolicyDraft('', {
      resourceId: 'new-resource',
      minTier: 'standard',
      roles: ['moderator'],
    })

    assert.deepEqual(loadPolicyDraft(''), {
      resourceId: 'new-resource',
      minTier: 'standard',
      roles: ['moderator'],
    })
  })

  test('clears completed or cancelled drafts', () => {
    storePolicyDraft('alpha', {
      resourceId: 'alpha',
      minTier: 'pro',
      roles: ['admin'],
    })
    clearPolicyDraft('alpha')

    assert.equal(loadPolicyDraft('alpha'), null)
    assert.deepEqual(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '{}'), {})
  })
})
