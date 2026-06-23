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
