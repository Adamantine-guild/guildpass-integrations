import './setup-env'
import { describe, test, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { LiveAccessApi } from '../lib/api/live'
import { MockAccessApi } from '../lib/api/mock'
import { ApiError } from '../lib/api/errors'
import { config } from '../lib/config'

function stubFetch(responses: Record<string, unknown>, status = 200) {
  global.fetch = async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [pattern, data] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        if (data === null || data === undefined) {
          return new Response(null, { status: 204 }) as any
        }
        return new Response(JSON.stringify(data), { status }) as any
      }
    }
    return new Response('Not Found', { status: 404 }) as any
  }
}

afterEach(() => {
  delete (global as any).fetch
  // Reset config option
  delete process.env.NEXT_PUBLIC_API_VALIDATION_LOG_ONLY
})

describe('runtime API schema validation', () => {
  test('conformant live response passes validation', async () => {
    stubFetch({
      '/v1/community': {
        id: 'c1',
        name: 'Valid Community',
        tiers: ['free', 'standard'],
      },
    })
    
    const api = new LiveAccessApi()
    await assert.doesNotReject(async () => {
      await api.getCommunity()
    })
  })

  test('malformed live response throws validation error in default/strict mode', async () => {
    // Missing required 'name' and 'tiers' fields for Community
    stubFetch({
      '/v1/community': {
        id: 'c1',
      },
    })

    const api = new LiveAccessApi()
    await assert.rejects(
      async () => {
        await api.getCommunity()
      },
      (err: any) => {
        assert.ok(err instanceof ApiError)
        assert.equal(err.status, 422)
        assert.equal(err.code, 'validation_error')
        assert.ok(err.safeMessage.includes('API contract mismatch'))
        assert.ok(err.safeMessage.includes('/v1/community'))
        assert.ok(err.safeMessage.includes('name: Required'))
        assert.ok(err.safeMessage.includes('tiers: Required'))
        return true
      }
    )
  })

  test('malformed live response logs and does not throw in log-only mode', async () => {
    // Set to log-only
    process.env.NEXT_PUBLIC_API_VALIDATION_LOG_ONLY = 'true'

    // Missing name and tiers
    stubFetch({
      '/v1/community': {
        id: 'c1',
      },
    })

    let loggedError = ''
    const originalConsoleError = console.error
    console.error = (msg: string) => {
      loggedError = msg
    }

    try {
      const api = new LiveAccessApi()
      const result = await api.getCommunity()
      
      assert.ok(result)
      assert.ok(loggedError.includes('API contract mismatch at /v1/community'))
      assert.ok(loggedError.includes('name: Required'))
      assert.ok(loggedError.includes('tiers: Required'))
    } finally {
      console.error = originalConsoleError
    }
  })

  test('mock mode responses are unaffected by validation', async () => {
    // Mock fetch to return malformed data if called (should not be called by mock client)
    stubFetch({
      '/v1/community': {
        id: 'c1',
      },
    })

    const api = new MockAccessApi('0xabc')
    // Mock client community should return default mock data successfully
    const result = await api.getCommunity()
    assert.equal(result.id, 'guildpass-demo')
  })
})
