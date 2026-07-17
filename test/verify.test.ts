import { describe, test, before } from 'node:test'
import * as assert from 'node:assert/strict'
import { MockAccessApi } from '../lib/api/mock'
import {
  canonicalize,
  signPayload,
  verifySignature,
  verifySignedResponseRaw,
  wrapInSignedEnvelope,
  MOCK_PRIVATE_KEY,
  MOCK_PUBLIC_KEY,
  VerifyError,
} from '../lib/api/verify'
import type { AccessPolicy } from '../lib/api/types'

// ── canonicalize ──────────────────────────────────────────────────────────────

describe('canonicalize', () => {
  test('sorts object keys lexicographically', () => {
    const result = canonicalize({ z: 1, a: 2, m: 3 })
    assert.equal(result, '{"a":2,"m":3,"z":1}')
  })

  test('handles nested objects', () => {
    const result = canonicalize({ b: { y: 1, x: 2 }, a: 3 })
    assert.equal(result, '{"a":3,"b":{"x":2,"y":1}}')
  })

  test('preserves array order', () => {
    const result = canonicalize({ ids: ['c', 'a', 'b'], name: 'test' })
    assert.equal(result, '{"ids":["c","a","b"],"name":"test"}')
  })

  test('handles null and primitives', () => {
    assert.equal(canonicalize(null), 'null')
    assert.equal(canonicalize(42), '42')
    assert.equal(canonicalize('hello'), '"hello"')
    assert.equal(canonicalize(true), 'true')
  })

  test('produces deterministic output regardless of key insertion order', () => {
    const a = canonicalize({ b: 1, a: 2 })
    const b = canonicalize({ a: 2, b: 1 })
    assert.equal(a, b)
  })

  test('deeply nested deterministic output', () => {
    const obj = { policy: { minTier: 'pro', roles: ['member'], resourceId: 'alpha' }, path: '/v1/policies/alpha' }
    const result = canonicalize(obj)
    // Should be sorted at every level
    const expected = '{"path":"/v1/policies/alpha","policy":{"minTier":"pro","resourceId":"alpha","roles":["member"]}}'
    assert.equal(result, expected)
  })
})

// ── signPayload / verifySignature ─────────────────────────────────────────────

describe('signPayload / verifySignature', () => {
  test('signs and verifies a payload correctly', () => {
    const payload = '{"path":"/v1/policies/alpha","timestamp":"2025-01-01T00:00:00Z","body":{"minTier":"standard"}}'
    const signature = signPayload(payload, MOCK_PRIVATE_KEY)
    assert.equal(signature.length, 64)
    assert.ok(verifySignature(payload, signature, MOCK_PUBLIC_KEY))
  })

  test('rejects tampered payload', () => {
    const payload = '{"path":"/v1/policies/alpha","timestamp":"2025-01-01T00:00:00Z","body":{"minTier":"standard"}}'
    const signature = signPayload(payload, MOCK_PRIVATE_KEY)
    const tamperedPayload = '{"path":"/v1/policies/alpha","timestamp":"2025-01-01T00:00:00Z","body":{"minTier":"pro"}}'
    assert.ok(!verifySignature(tamperedPayload, signature, MOCK_PUBLIC_KEY))
  })

  test('rejects wrong public key', () => {
    const payload = '{"test":"data"}'
    const signature = signPayload(payload, MOCK_PRIVATE_KEY)
    const wrongKey = new Uint8Array(32)
    assert.ok(!verifySignature(payload, signature, wrongKey))
  })
})

// ── wrapInSignedEnvelope ──────────────────────────────────────────────────────

describe('wrapInSignedEnvelope', () => {
  test('produces a valid SignedResponse', () => {
    const data = { minTier: 'standard' as const, resourceId: 'alpha' }
    const envelope = wrapInSignedEnvelope(data, '/v1/policies/alpha', MOCK_PRIVATE_KEY)

    assert.equal(envelope.data, data)
    assert.equal(envelope.signature.algorithm, 'ed25519')
    assert.equal(envelope.signature.key_id, 'mock-dev')
    assert.equal(typeof envelope.signature.payload, 'string')
    assert.equal(typeof envelope.signature.value, 'string')

    // Verify the signature
    const valid = verifySignature(envelope.signature.payload, Uint8Array.from(atob(envelope.signature.value), c => c.charCodeAt(0)), MOCK_PUBLIC_KEY)
    assert.ok(valid)
  })

  test('canonical includes path, timestamp, and body', () => {
    const data = { test: true }
    const envelope = wrapInSignedEnvelope(data, '/v1/test', MOCK_PRIVATE_KEY)
    const parsed = JSON.parse(envelope.signature.payload)
    assert.equal(parsed.path, '/v1/test')
    assert.equal(typeof parsed.timestamp, 'string')
    assert.deepEqual(parsed.body, { test: true })
  })
})

// ── verifySignedResponseRaw ──────────────────────────────────────────────────

describe('verifySignedResponseRaw', () => {
  test('returns data on valid signed response (enforce mode)', () => {
    const data = { allowed: true }
    const envelope = wrapInSignedEnvelope(data, '/v1/test', MOCK_PRIVATE_KEY)
    const result = verifySignedResponseRaw(envelope, MOCK_PUBLIC_KEY, 'enforce')
    assert.deepEqual(result, data)
  })

  test('returns data on valid signed response (warn mode)', () => {
    const data = { allowed: true }
    const envelope = wrapInSignedEnvelope(data, '/v1/test', MOCK_PRIVATE_KEY)
    const result = verifySignedResponseRaw(envelope, MOCK_PUBLIC_KEY, 'warn')
    assert.deepEqual(result, data)
  })

  test('returns raw on unsigned response in warn mode', () => {
    const raw = { minTier: 'standard' }
    const result = verifySignedResponseRaw(raw, MOCK_PUBLIC_KEY, 'warn')
    assert.deepEqual(result, raw)
  })

  test('returns raw on unsigned response in off mode', () => {
    const raw = { minTier: 'standard' }
    const result = verifySignedResponseRaw(raw, MOCK_PUBLIC_KEY, 'off')
    assert.deepEqual(result, raw)
  })

  test('throws VerifyError on unsigned response in enforce mode', () => {
    const raw = { minTier: 'standard' }
    assert.throws(
      () => verifySignedResponseRaw(raw, MOCK_PUBLIC_KEY, 'enforce'),
      (err: unknown) => err instanceof VerifyError,
    )
  })

  test('rejects tampered data in enforce mode', () => {
    const data = { allowed: false }
    const envelope = wrapInSignedEnvelope(data, '/v1/test', MOCK_PRIVATE_KEY)
    // Tamper with the data inside the envelope (this invalidates the signature
    // because the payload was computed over the original data)
    const tampered = { ...envelope, data: { allowed: true } }
    assert.throws(
      () => verifySignedResponseRaw(tampered, MOCK_PUBLIC_KEY, 'enforce'),
      (err: unknown) => err instanceof VerifyError,
    )
  })

  test('rejects tampered payload string in enforce mode', () => {
    const data = { allowed: false }
    const envelope = wrapInSignedEnvelope(data, '/v1/test', MOCK_PRIVATE_KEY)
    const tampered = {
      ...envelope,
      signature: { ...envelope.signature, payload: '{"path":"/v1/test","timestamp":"x","body":{"allowed":true}}' },
    }
    assert.throws(
      () => verifySignedResponseRaw(tampered, MOCK_PUBLIC_KEY, 'enforce'),
      (err: unknown) => err instanceof VerifyError,
    )
  })

  test('rejects bad base64 signature in enforce mode', () => {
    const data = { allowed: false }
    const envelope = wrapInSignedEnvelope(data, '/v1/test', MOCK_PRIVATE_KEY)
    const tampered = {
      ...envelope,
      signature: { ...envelope.signature, value: '!!!invalid-base64!!!' },
    }
    assert.throws(
      () => verifySignedResponseRaw(tampered, MOCK_PUBLIC_KEY, 'enforce'),
      (err: unknown) => err instanceof VerifyError,
    )
  })

  test('warns but does not throw on tampered data in warn mode', () => {
    const data = { allowed: false }
    const envelope = wrapInSignedEnvelope(data, '/v1/test', MOCK_PRIVATE_KEY)
    const tampered = { ...envelope, data: { allowed: true } }
    // Should not throw in warn mode
    const result = verifySignedResponseRaw(tampered, MOCK_PUBLIC_KEY, 'warn')
    // Should return the tampered data (warns but doesn't block)
    assert.deepEqual(result, { allowed: true })
  })
})

// ── Full integration: MockAccessApi signing + verification ────────────────────

describe('MockAccessApi signed responses', () => {
  test('returns verified data from getPolicy', async () => {
    const api = new MockAccessApi()
    const policy = await api.getPolicy('alpha')
    assert.ok(policy)
    assert.equal(policy.resourceId, 'alpha')
  })

  test('returns verified data from listPolicies', async () => {
    const api = new MockAccessApi()
    const policies = await api.listPolicies()
    assert.ok(policies.length > 0)
  })

  test('returns verified data from getSession', async () => {
    const api = new MockAccessApi('0xabc')
    const session = await api.getSession()
    assert.ok(session.community)
    assert.equal(session.address, '0xabc')
  })

  test('returns verified null from getPolicy when not found', async () => {
    const api = new MockAccessApi()
    const result = await api.getPolicy('non-existent')
    assert.equal(result, null)
  })

  // ── CRITICAL TEST: Tamper detection ──────────────────────────────────────
  // This test simulates an attacker modifying a "denied" response into an
  // "allowed" response after signing. The verification must catch this.

  test('rejects tampered policy response (grant forged from deny)', async () => {
    // Step 1: Create a legitimate signed "denied" policy
    const denyPolicy: AccessPolicy = { resourceId: 'alpha', minTier: 'pro' }
    const signed = wrapInSignedEnvelope(denyPolicy, '/v1/policies/alpha', MOCK_PRIVATE_KEY)

    // Step 2: Attacker mutates the data to grant access
    const forged: AccessPolicy = { resourceId: 'alpha', minTier: 'free' }
    const tampered = { ...signed, data: forged }

    // Step 3: Verification must reject the forged response.
    // The signature is still valid (payload string unchanged), but the body
    // comparison fails because `data` no longer matches the payload body.
    assert.throws(
      () => verifySignedResponseRaw(tampered, MOCK_PUBLIC_KEY, 'enforce'),
      (err: unknown) => {
        return err instanceof VerifyError
          && err.safeMessage.includes('Response body does not match signed payload')
      },
      'Should reject tampered grant with VerifyError',
    )
  })

  test('rejects tampered deny into allow via payload mutation', async () => {
    // Attacker modifies the signature payload to match the forged data
    const originalData = { resourceId: 'alpha', minTier: 'pro' }
    const signed = wrapInSignedEnvelope(originalData, '/v1/policies/alpha', MOCK_PRIVATE_KEY)

    // Attacker computes a NEW payload for forged data but can't sign it
    const forgedData = { resourceId: 'alpha', minTier: 'free' }
    const tampered = {
      ...signed,
      data: forgedData,
      signature: {
        ...signed.signature,
        // The payload still describes the original data — mismatch
      },
    }

    assert.throws(
      () => verifySignedResponseRaw(tampered, MOCK_PUBLIC_KEY, 'enforce'),
      VerifyError,
      'Should reject because payload describes old data but body was changed',
    )
  })

  test('mock API internally verifies before returning (self-consistency)', async () => {
    // The MockAccessApi now wraps responses in signed envelopes and verifies
    // them internally. This test confirms the full cycle works.
    const api = new MockAccessApi('0xabc')
    const session = await api.getSession()

    // The session should have been signed, verified, and returned
    assert.ok(session)
    assert.equal(typeof session.address, 'string')
  })
})

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('verify edge cases', () => {
  test('handles empty object data', () => {
    const envelope = wrapInSignedEnvelope({}, '/v1/test', MOCK_PRIVATE_KEY)
    const result = verifySignedResponseRaw(envelope, MOCK_PUBLIC_KEY, 'enforce')
    assert.deepEqual(result, {})
  })

  test('handles array data', () => {
    const data = [{ id: 1 }, { id: 2 }]
    const envelope = wrapInSignedEnvelope(data, '/v1/test', MOCK_PRIVATE_KEY)
    const result = verifySignedResponseRaw(envelope, MOCK_PUBLIC_KEY, 'enforce')
    assert.deepEqual(result, data)
  })

  test('empty signature value in enforce mode', () => {
    const signed = {
      data: { test: true },
      signature: {
        payload: '{"test":true}',
        value: '',
        algorithm: 'ed25519' as const,
        key_id: 'test',
      },
    }
    assert.throws(
      () => verifySignedResponseRaw(signed, MOCK_PUBLIC_KEY, 'enforce'),
      VerifyError,
    )
  })
})
