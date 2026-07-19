import './setup-env'
import { describe, test, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { LiveAccessApi } from '../lib/api/live'
import { ApiError } from '../lib/api/errors'
import * as FIXTURES from './fixtures/live-api-responses'

/**
 * Regression coverage for the safe 404 -> list-and-filter fallback (#133).
 *
 * `getResource` / `getPolicy` attempt a direct lookup first. On a 404 they must
 * fall back to listing all items and filtering client-side (for compatibility
 * with older backends). On ANY other error (e.g. 500) they must let the error
 * propagate and must NOT silently fall back to the list endpoint.
 *
 * These tests drive real HTTP status codes through a routing fetch stub so the
 * 404 branch and the non-404 branch are each exercised for what they actually
 * are, and they assert the list endpoint is never contacted when the direct
 * lookup fails with a non-404 status.
 */

interface RouteResponse {
  status: number
  /** JSON body to return; omit for an empty body. */
  body?: unknown
}

/**
 * Install a fetch stub that matches request URLs against `routes` by substring
 * and returns the configured status/body. Records every requested URL so tests
 * can assert which endpoints were (and were not) contacted.
 *
 * The first matching route wins, so register more specific paths (the direct
 * `/v1/resources/alpha`) before less specific ones (the list `/v1/resources`).
 */
function stubFetchByStatus(routes: Array<[pattern: string, res: RouteResponse]>): {
  calls: string[]
} {
  const calls: string[] = []

  global.fetch = async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)

    for (const [pattern, res] of routes) {
      if (url.includes(pattern)) {
        const payload =
          res.body === undefined ? '' : JSON.stringify(res.body)
        return new Response(payload, { status: res.status }) as any
      }
    }

    return new Response('Not Found', { status: 404 }) as any
  }

  return { calls }
}

afterEach(() => {
  delete (global as any).fetch
})

// ── Resource fallback ─────────────────────────────────────────────────────────

describe('getResource safe fallback (#133)', () => {
  test('falls back to list-and-filter when the direct lookup returns a real 404', async () => {
    const { calls } = stubFetchByStatus([
      ['/v1/resources/alpha', { status: 404 }],
      ['/v1/resources', { status: 200, body: FIXTURES.resources }],
    ])

    const api = new LiveAccessApi()
    const r = await api.getResource('alpha')

    assert.ok(r, 'expected the resource to be recovered via the list fallback')
    assert.equal(r.id, 'alpha')
    assert.ok(
      calls.some((u) => u.includes('/v1/resources/alpha')),
      'expected the direct lookup to be attempted first',
    )
    assert.ok(
      calls.some((u) => u.endsWith('/v1/resources')),
      'expected the list endpoint to be contacted for the fallback',
    )
  })

  test('returns null when the direct lookup 404s and the item is absent from the list', async () => {
    const { calls } = stubFetchByStatus([
      ['/v1/resources/ghost', { status: 404 }],
      ['/v1/resources', { status: 200, body: FIXTURES.resources }],
    ])

    const api = new LiveAccessApi()
    const r = await api.getResource('ghost')

    assert.equal(r, null)
    assert.ok(
      calls.some((u) => u.endsWith('/v1/resources')),
      'expected the list endpoint to be searched before returning null',
    )
  })

  test('propagates a non-404 error (500) WITHOUT triggering the list fallback', async () => {
    const { calls } = stubFetchByStatus([
      ['/v1/resources/alpha', { status: 500 }],
      ['/v1/resources', { status: 200, body: FIXTURES.resources }],
    ])

    const api = new LiveAccessApi()

    await assert.rejects(
      () => api.getResource('alpha'),
      (err: ApiError) =>
        err instanceof ApiError &&
        err.status === 500 &&
        err.code === 'server_error',
      'a 500 on the direct lookup must propagate, not fall back',
    )

    assert.ok(
      !calls.some((u) => u.endsWith('/v1/resources')),
      'the list endpoint must NOT be contacted when the direct lookup fails with a non-404',
    )
  })
})

// ── Policy fallback ───────────────────────────────────────────────────────────

describe('getPolicy safe fallback (#133)', () => {
  test('falls back to list-and-filter when the direct lookup returns a real 404', async () => {
    const { calls } = stubFetchByStatus([
      ['/v1/policies/alpha', { status: 404 }],
      ['/v1/policies', { status: 200, body: FIXTURES.policies }],
    ])

    const api = new LiveAccessApi()
    const p = await api.getPolicy('alpha')

    assert.ok(p, 'expected the policy to be recovered via the list fallback')
    assert.equal(p.resourceId, 'alpha')
    assert.ok(
      calls.some((u) => u.includes('/v1/policies/alpha')),
      'expected the direct lookup to be attempted first',
    )
    assert.ok(
      calls.some((u) => u.endsWith('/v1/policies')),
      'expected the list endpoint to be contacted for the fallback',
    )
  })

  test('returns null when the direct lookup 404s and the item is absent from the list', async () => {
    const { calls } = stubFetchByStatus([
      ['/v1/policies/ghost', { status: 404 }],
      ['/v1/policies', { status: 200, body: FIXTURES.policies }],
    ])

    const api = new LiveAccessApi()
    const p = await api.getPolicy('ghost')

    assert.equal(p, null)
    assert.ok(
      calls.some((u) => u.endsWith('/v1/policies')),
      'expected the list endpoint to be searched before returning null',
    )
  })

  test('propagates a non-404 error (500) WITHOUT triggering the list fallback', async () => {
    const { calls } = stubFetchByStatus([
      ['/v1/policies/alpha', { status: 500 }],
      ['/v1/policies', { status: 200, body: FIXTURES.policies }],
    ])

    const api = new LiveAccessApi()

    await assert.rejects(
      () => api.getPolicy('alpha'),
      (err: ApiError) =>
        err instanceof ApiError &&
        err.status === 500 &&
        err.code === 'server_error',
      'a 500 on the direct lookup must propagate, not fall back',
    )

    assert.ok(
      !calls.some((u) => u.endsWith('/v1/policies')),
      'the list endpoint must NOT be contacted when the direct lookup fails with a non-404',
    )
  })
})