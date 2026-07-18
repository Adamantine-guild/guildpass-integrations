import './setup-env'
import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import { LiveAccessApi } from '../lib/api/live'
import { ApiError } from '../lib/api/errors'

const api = new LiveAccessApi('0xabc', 'token')

test('parses successful responses', async () => {
  global.fetch = async () =>
    new Response(
      JSON.stringify({ id: 'c1', name: 'Guild', tiers: ['free'] }),
      { status: 200 },
    ) as any

  const community = await api.getCommunity()
  assert.equal(community.id, 'c1')
})

test('handles 204 responses safely', async () => {
  global.fetch = async () => new Response(null, { status: 204 }) as any
  await assert.doesNotReject(() => api.siweLogout('token'))
})

test('preserves json error details and status', async () => {
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        message: 'Invalid membership data',
        details: { field: 'tier' },
      }),
      { status: 422 },
    ) as any

  await assert.rejects(
    () => api.getCommunity(),
    (err: ApiError) =>
      err instanceof ApiError &&
      err.status === 422 &&
      err.code === 'validation_error' &&
      err.details?.field === 'tier',
  )
})

test('handles empty error bodies safely', async () => {
  global.fetch = async () => new Response('', { status: 404 }) as any

  await assert.rejects(
    () => api.getCommunity(),
    (err: ApiError) =>
      err instanceof ApiError && err.code === 'not_found',
  )
})

test('normalizes network failures', async () => {
  global.fetch = async () => {
    throw new Error('connect ECONNREFUSED')
  }

  await assert.rejects(
    () => api.getCommunity(),
    (err: ApiError) =>
      err instanceof ApiError &&
      err.code === 'network_error' &&
      err.retryable,
  )
})

test('includes request path in error', async () => {
  global.fetch = async () =>
    new Response('', { status: 403 }) as any

  await assert.rejects(
    () => api.getCommunity(),
    (err: ApiError) =>
      err instanceof ApiError &&
      err.code === 'forbidden' &&
      typeof err.path === 'string' &&
      err.path.includes('/v1/community'),
  )
})

test('handles HTML error bodies gracefully', async () => {
  global.fetch = async () =>
    new Response(
      '<html><body>502 Bad Gateway</body></html>',
      { status: 502 },
    ) as any

  await assert.rejects(
    () => api.getCommunity(),
    (err: ApiError) =>
      err instanceof ApiError &&
      err.status === 502 &&
      err.code === 'server_error' &&
      err.retryable,
  )
})

test('marks 401 as non-retryable', async () => {
  global.fetch = async () =>
    new Response('', { status: 401 }) as any

  await assert.rejects(
    () => api.getSession(),
    (err: ApiError) =>
      err instanceof ApiError &&
      err.code === 'unauthorized' &&
      !err.retryable,
  )
})

test('marks 429 as retryable', async () => {
  global.fetch = async () =>
    new Response('', { status: 429 }) as any

  await assert.rejects(
    () => api.getSession(),
    (err: ApiError) =>
      err instanceof ApiError &&
      err.code === 'rate_limited' &&
      err.retryable,
  )
})
