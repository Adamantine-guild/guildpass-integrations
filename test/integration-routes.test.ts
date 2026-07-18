import { describe, it, mock } from 'node:test'
import * as assert from 'node:assert/strict'

// ---------------------------------------------------------------------------
// Mock helpers: mimic NextRequest / NextResponse contracts
// ---------------------------------------------------------------------------

function mockNextRequest(params: Record<string, string>) {
  return {
    nextUrl: {
      searchParams: {
        get(key: string) {
          return key in params ? params[key] : null
        },
      },
    },
  }
}

interface MockResponse {
  body: unknown
  status: number
}

// ---------------------------------------------------------------------------
// Handler logic extracted from app/api/integration/membership/route.ts
// ---------------------------------------------------------------------------

async function handleMembershipGet(
  req: ReturnType<typeof mockNextRequest>,
  fetchMembership: (address: string) => Promise<unknown>,
): Promise<MockResponse> {
  const address = req.nextUrl.searchParams.get('address')

  if (!address) {
    return { body: { error: 'Missing required query parameter: address' }, status: 400 }
  }

  try {
    const membership = await fetchMembership(address)
    return { body: membership, status: 200 }
  } catch (error) {
    return {
      body: {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to fetch membership information',
      },
      status: 502,
    }
  }
}

// ---------------------------------------------------------------------------
// Handler logic extracted from app/api/integration/verify/route.ts
// ---------------------------------------------------------------------------

async function handleVerifyGet(
  req: ReturnType<typeof mockNextRequest>,
  verify: (address: string) => Promise<unknown>,
): Promise<MockResponse> {
  const address = req.nextUrl.searchParams.get('address')

  if (!address) {
    return { body: { error: 'Missing required query parameter: address' }, status: 400 }
  }

  try {
    const verification = await verify(address)
    return { body: verification, status: 200 }
  } catch (error) {
    return {
      body: {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to verify wallet',
      },
      status: 502,
    }
  }
}

// ===========================================================================
// Tests: GET /api/integration/membership
// ===========================================================================

describe('GET /api/integration/membership', () => {
  it('returns 400 when address query param is missing', async () => {
    const req = mockNextRequest({})
    const fetchMembership = mock.fn<(address: string) => Promise<unknown>>()

    const res = await handleMembershipGet(req, fetchMembership)

    assert.equal(res.status, 400)
    assert.deepEqual(res.body, { error: 'Missing required query parameter: address' })
    assert.equal(fetchMembership.mock.callCount(), 0)
  })

  it('returns 200 with membership JSON for a valid address', async () => {
    const membershipData = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      tier: 'gold',
      active: true,
      expiresAt: '2027-06-01T00:00:00.000Z',
    }
    const fetchMembership = mock.fn(async (_addr: string) => membershipData)

    const req = mockNextRequest({ address: '0x1234567890abcdef1234567890abcdef12345678' })
    const res = await handleMembershipGet(req, fetchMembership)

    assert.equal(res.status, 200)
    assert.deepEqual(res.body, membershipData)
    assert.equal(fetchMembership.mock.callCount(), 1)
    assert.equal(
      fetchMembership.mock.calls[0].arguments[0],
      '0x1234567890abcdef1234567890abcdef12345678',
    )
  })

  it('returns 502 with safe error when fetchMembershipByWallet throws', async () => {
    const fetchMembership = mock.fn(async (_addr: string) => {
      throw new Error('Upstream service unavailable')
    })

    const req = mockNextRequest({ address: '0xabc' })
    const res = await handleMembershipGet(req, fetchMembership)

    assert.equal(res.status, 502)
    assert.deepEqual(res.body, { error: 'Upstream service unavailable' })
  })

  it('returns 502 with safe fallback for non-Error throws', async () => {
    const fetchMembership = mock.fn(async (_addr: string) => {
      throw 'something broke'
    })

    const req = mockNextRequest({ address: '0xabc' })
    const res = await handleMembershipGet(req, fetchMembership)

    assert.equal(res.status, 502)
    assert.deepEqual(res.body, { error: 'Unable to fetch membership information' })
  })
})

// ===========================================================================
// Tests: GET /api/integration/verify
// ===========================================================================

describe('GET /api/integration/verify', () => {
  it('returns 400 when address query param is missing', async () => {
    const req = mockNextRequest({})
    const verify = mock.fn<(address: string) => Promise<unknown>>()

    const res = await handleVerifyGet(req, verify)

    assert.equal(res.status, 400)
    assert.deepEqual(res.body, { error: 'Missing required query parameter: address' })
    assert.equal(verify.mock.callCount(), 0)
  })

  it('returns 200 with verification JSON for a valid address', async () => {
    const verificationData = {
      verified: true,
      method: 'signature',
      checkedAt: '2026-06-29T03:00:00.000Z',
    }
    const verify = mock.fn(async (_addr: string) => verificationData)

    const req = mockNextRequest({ address: '0xabcdef' })
    const res = await handleVerifyGet(req, verify)

    assert.equal(res.status, 200)
    assert.deepEqual(res.body, verificationData)
    assert.equal(verify.mock.callCount(), 1)
    assert.equal(verify.mock.calls[0].arguments[0], '0xabcdef')
  })

  it('returns 502 with safe error when verifyWallet throws', async () => {
    const verify = mock.fn(async (_addr: string) => {
      throw new Error('Verification service error')
    })

    const req = mockNextRequest({ address: '0xabc' })
    const res = await handleVerifyGet(req, verify)

    assert.equal(res.status, 502)
    assert.deepEqual(res.body, { error: 'Verification service error' })
  })

  it('returns 502 with safe fallback for non-Error throws', async () => {
    const verify = mock.fn(async (_addr: string) => {
      throw null
    })

    const req = mockNextRequest({ address: '0xabc' })
    const res = await handleVerifyGet(req, verify)

    assert.equal(res.status, 502)
    assert.deepEqual(res.body, { error: 'Unable to verify wallet' })
  })
})