import type { Membership, WalletVerification } from '@/lib/api/types'

interface IntegrationClientModule {
  IntegrationClient?: any
  default?: any
}

function normalizeMembership(raw: any): Membership {
  return {
    address:
      raw?.address ?? raw?.walletAddress ?? raw?.wallet_address ?? '',
    tier:
      raw?.tier ?? raw?.membershipTier ?? raw?.membership_tier ?? 'free',
    active:
      raw?.active ?? raw?.isActive ?? raw?.is_active ?? false,
    expiresAt: raw?.expiresAt ?? raw?.expires_at ?? undefined,
  }
}

function normalizeVerification(raw: any): WalletVerification {
  return {
    verified:
      Boolean(raw?.verified ?? raw?.isVerified ?? raw?.verified_status ?? false),
    method:
      raw?.method ?? raw?.verificationMethod ?? raw?.verification_method,
    checkedAt:
      raw?.checkedAt ?? raw?.checked_at ?? new Date().toISOString(),
  }
}

async function createIntegrationClient() {
  const apiKey = process.env.INTEGRATION_API_KEY
  if (!apiKey) {
    throw new Error(
      'INTEGRATION_API_KEY is required to initialize @guildpass/integration-client.',
    )
  }

  const module = (await import('@guildpass/integration-client')) as IntegrationClientModule
  const Client = module.IntegrationClient ?? module.default

  if (typeof Client !== 'function') {
    throw new Error(
      'Unable to resolve IntegrationClient from @guildpass/integration-client.',
    )
  }

  return new Client({ apiKey })
}

function getMembershipMethod(client: any) {
  return (
    client.getMembershipByWallet ??
    client.membershipByWallet ??
    client.getMembership ??
    client.membership
  )
}

function getVerificationMethod(client: any) {
  return (
    client.verifyWallet ??
    client.verifyWalletAddress ??
    client.checkWallet ??
    client.verify
  )
}

export async function fetchMembershipByWallet(address: string): Promise<Membership | null> {
  const client = await createIntegrationClient()
  const method = getMembershipMethod(client)

  if (typeof method !== 'function') {
    throw new Error('IntegrationClient does not expose a wallet membership lookup method.')
  }

  const raw = await method.call(client, address)
  return raw ? normalizeMembership(raw) : null
}

export async function verifyWallet(address: string): Promise<WalletVerification> {
  const client = await createIntegrationClient()
  const method = getVerificationMethod(client)

  if (typeof method !== 'function') {
    throw new Error('IntegrationClient does not expose a wallet verification method.')
  }

  const raw = await method.call(client, address)
  return normalizeVerification(raw)
}
