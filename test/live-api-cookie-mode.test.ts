import './setup-env'
import { describe, test, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'

/**
 * Focused unit tests for lib/api/live.ts's cookie-auth-mode invariants
 * (dual-mode readiness — see docs/http-only-cookie-migration.md):
 *
 *   - Authorization is never sent in cookie mode, even when a token is
 *     passed to the constructor or to siweLogout().
 *   - credentials: 'include' is sent on every request in cookie mode (and
 *     omitted — not merely falsy, actually absent as a key — in bearer mode,
 *     so the request shape is provably unchanged there).
 *   - siweLogout() never produces "Bearer undefined" / "Bearer null" /
 *     "Bearer " in ANY mode.
 *   - getSessionStatus() maps 200 authenticated:true/false, 401, 404, 500,
 *     and network failure correctly, and never includes a token field.
 *
 * lib/api/live.ts reads `config.authMode` from the frozen lib/config.ts
 * singleton, so each variant requires a fresh require() after setting
 * NEXT_PUBLIC_AUTH_MODE (same pattern as test/session-cookie-mode.test.ts).
 */

type CapturedCall = { url: string; init: RequestInit }

let captured: CapturedCall[] = []

function stubFetch(respond: (call: CapturedCall) => Response | Promise<Response>): void {
  captured = []
  ;(global as any).fetch = async (url: string, init: RequestInit = {}) => {
    const call = { url, init }
    captured.push(call)
    return respond(call)
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }) as any
}

function loadLiveApi(authMode: 'bearer' | 'cookie' | undefined): typeof import('../lib/api/live') {
  if (authMode === undefined) {
    delete process.env.NEXT_PUBLIC_AUTH_MODE
  } else {
    process.env.NEXT_PUBLIC_AUTH_MODE = authMode
  }
  // apiMode and authMode are orthogonal (see test/config-auth-mode.test.ts).
  // Keep apiMode 'mock' so lib/api/backendStatus.ts's ensureOnline() takes
  // its mock-mode fast path instead of issuing its own /healthz fetch — that
  // extra call would otherwise also hit the stub below and pollute the call
  // count this suite asserts on. LiveAccessApi itself does not read apiMode.
  process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
  delete process.env.NEXT_PUBLIC_CORE_API_URL
  delete require.cache[require.resolve('../lib/config')]
  delete require.cache[require.resolve('../lib/api/live')]
  return require('../lib/api/live')
}

function headerValue(init: RequestInit, name: string): string | undefined {
  const headers = init.headers as Record<string, string> | undefined
  if (!headers) return undefined
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase())
  return key ? headers[key] : undefined
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_AUTH_MODE
  delete process.env.NEXT_PUBLIC_MOCK_MODE
})

describe('LiveAccessApi cookie auth mode (#dual-mode-cookie-readiness)', () => {
  test('bearer mode: Authorization header is sent with the constructor token, no credentials key', async () => {
    const { LiveAccessApi } = loadLiveApi('bearer')
    stubFetch(() => jsonResponse({ id: 'c1', name: 'Guild', tiers: ['free'] }))
    const api = new LiveAccessApi('0xabc', 'real-token')
    await api.getCommunity()

    assert.equal(captured.length, 1)
    assert.equal(headerValue(captured[0].init, 'Authorization'), 'Bearer real-token')
    // `credentials: undefined` is equivalent to omitting the option for
    // fetch's purposes — bearer mode's request shape is unchanged.
    assert.equal(captured[0].init.credentials, undefined)
  })

  test('cookie mode: Authorization is never sent even if a token is passed to the constructor', async () => {
    const { LiveAccessApi } = loadLiveApi('cookie')
    stubFetch(() => jsonResponse({ id: 'c1', name: 'Guild', tiers: ['free'] }))
    const api = new LiveAccessApi('0xabc', 'real-token')
    await api.getCommunity()

    assert.equal(captured.length, 1)
    assert.equal(headerValue(captured[0].init, 'Authorization'), undefined)
    assert.equal(captured[0].init.credentials, 'include')
  })

  test('cookie mode: credentials "include" is sent on every request type (GET and POST)', async () => {
    const { LiveAccessApi } = loadLiveApi('cookie')
    stubFetch(() => jsonResponse({ nonce: 'abc123' }))
    const api = new LiveAccessApi('0xabc')
    await api.getNonce('0xabc')

    assert.equal(captured[0].init.credentials, 'include')
  })

  for (const token of [undefined, null, ''] as const) {
    test(`siweLogout(${JSON.stringify(token)}) in bearer mode never sends "Bearer undefined/null/empty"`, async () => {
      const { LiveAccessApi } = loadLiveApi('bearer')
      stubFetch(() => new Response(null, { status: 204 }) as any)
      const api = new LiveAccessApi('0xabc')
      await api.siweLogout(token as any)

      const authHeader = headerValue(captured[0].init, 'Authorization')
      assert.equal(authHeader, undefined)
    })
  }

  test('siweLogout() with a real token in bearer mode sends it; in cookie mode it never does', async () => {
    const bearerApi = new (loadLiveApi('bearer').LiveAccessApi)('0xabc')
    stubFetch(() => new Response(null, { status: 204 }) as any)
    await bearerApi.siweLogout('real-token')
    assert.equal(headerValue(captured[0].init, 'Authorization'), 'Bearer real-token')

    const cookieApi = new (loadLiveApi('cookie').LiveAccessApi)('0xabc')
    stubFetch(() => new Response(null, { status: 204 }) as any)
    await cookieApi.siweLogout('real-token')
    assert.equal(headerValue(captured[0].init, 'Authorization'), undefined)
  })

  test('getSessionStatus(): 200 authenticated:true passes through with no token field', async () => {
    const { LiveAccessApi } = loadLiveApi('cookie')
    stubFetch(() =>
      jsonResponse({ authenticated: true, address: '0xabc', expiresAt: new Date(Date.now() + 60_000).toISOString() }),
    )
    const api = new LiveAccessApi()
    const status = await api.getSessionStatus()
    assert.equal(status.authenticated, true)
    assert.equal('token' in status, false)
  })

  test('getSessionStatus(): 200 authenticated:false resolves without throwing', async () => {
    const { LiveAccessApi } = loadLiveApi('cookie')
    stubFetch(() => jsonResponse({ authenticated: false }))
    const api = new LiveAccessApi()
    assert.deepEqual(await api.getSessionStatus(), { authenticated: false })
  })

  test('getSessionStatus(): 401 resolves to authenticated:false (does not throw)', async () => {
    const { LiveAccessApi } = loadLiveApi('cookie')
    stubFetch(() => jsonResponse({ code: 'unauthorized' }, 401))
    const api = new LiveAccessApi()
    assert.deepEqual(await api.getSessionStatus(), { authenticated: false })
  })

  test('getSessionStatus(): 404 resolves to authenticated:false (does not throw)', async () => {
    const { LiveAccessApi } = loadLiveApi('cookie')
    stubFetch(() => jsonResponse({}, 404))
    const api = new LiveAccessApi()
    assert.deepEqual(await api.getSessionStatus(), { authenticated: false })
  })

  test('getSessionStatus(): 500 propagates as an ApiError (does not resolve false)', async () => {
    const { LiveAccessApi } = loadLiveApi('cookie')
    stubFetch(() => jsonResponse({ message: 'boom' }, 500))
    const api = new LiveAccessApi()
    await assert.rejects(() => api.getSessionStatus())
  })

  test('getSessionStatus(): network failure propagates (does not resolve false)', async () => {
    const { LiveAccessApi } = loadLiveApi('cookie')
    ;(global as any).fetch = async () => {
      throw new Error('connect ECONNREFUSED')
    }
    const api = new LiveAccessApi()
    await assert.rejects(() => api.getSessionStatus())
  })
})
