import { NextRequest, NextResponse } from 'next/server'
import { verifyWallet } from '@/lib/integration-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')

  if (!address) {
    return NextResponse.json(
      { error: 'Missing required query parameter: address' },
      { status: 400 },
    )
  }

  try {
    const verification = await verifyWallet(address)
    return NextResponse.json(verification)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to verify wallet',
      },
      { status: 502 },
    )
  }
}
