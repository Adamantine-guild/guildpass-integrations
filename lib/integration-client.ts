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

export class GatewayConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GatewayConfigurationError'
  }
}

export class GatewayDependencyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GatewayDependencyError'
  }
}

export class GatewayMethodError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GatewayMethodError'
  }
}

async function createIntegrationClient() {
  const apiKey = process.env.INTEGRATION_API_KEY
  if (!apiKey) {
    throw new GatewayConfigurationError(
      'INTEGRATION_API_KEY is required to initialize @guildpass/integration-client.',
    )
  }

  let clientModule: IntegrationClientModule
  try {
    clientModule = (await import('@guildpass/integration-client')) as IntegrationClientModule
  } catch (error: any) {
    if (error.code === 'MODULE_NOT_FOUND') {
      throw new GatewayDependencyError(
        'Optional dependency @guildpass/integration-client is not installed.',
      )
    }
    throw error
  }

  const Client = clientModule.IntegrationClient ?? clientModule.default

  if (typeof Client !== 'function') {
    throw new GatewayMethodError(
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
    throw new GatewayMethodError('IntegrationClient does not expose a wallet membership lookup method.')
  }

  const raw = await method.call(client, address)
  return raw ? normalizeMembership(raw) : null
}

export async function verifyWallet(address: string): Promise<WalletVerification> {
  const client = await createIntegrationClient()
  const method = getVerificationMethod(client)

  if (typeof method !== 'function') {
    throw new GatewayMethodError('IntegrationClient does not expose a wallet verification method.')
  }

  const raw = await method.call(client, address)
  return normalizeVerification(raw)
}

/**
 * Returns true when INTEGRATION_API_KEY is set.
 * Does not expose the key value.
 */
export function isGatewayConfigured(): boolean {
  return Boolean(process.env.INTEGRATION_API_KEY)
}

/**
 * Returns true when the optional @guildpass/integration-client package can be imported.
 */
export function isGatewayDependencyAvailable(): boolean {
  try {
    require.resolve('@guildpass/integration-client')
    return true
  } catch {
    return false
  }
}

/**
 * Returns true when the resolved client exposes a membership lookup method.
 */
export function isGatewayMethodSupported(): boolean {
  try {
    const mod = require('@guildpass/integration-client') as IntegrationClientModule
    const Client = mod.IntegrationClient ?? mod.default
    if (typeof Client !== 'function') return false
    // Instantiate without calling — just check the prototype has the method
    const instance = Object.create(Client.prototype)
    return (
      typeof instance.getMembershipByWallet === 'function' ||
      typeof instance.membershipByWallet === 'function' ||
      typeof instance.getMembership === 'function' ||
      typeof instance.membership === 'function'
    )
  } catch {
    return false
  }
}
