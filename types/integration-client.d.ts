declare module '@guildpass/integration-client' {
  export interface IntegrationClientOptions {
    apiKey: string
  }

  export interface IntegrationMembershipResponse {
    address?: string
    walletAddress?: string
    wallet_address?: string
    tier?: string
    membershipTier?: string
    membership_tier?: string
    active?: boolean
    isActive?: boolean
    is_active?: boolean
    expiresAt?: string
    expires_at?: string
  }

  export interface IntegrationWalletVerificationResponse {
    verified?: boolean
    isVerified?: boolean
    verified_status?: boolean
    method?: string
    verificationMethod?: string
    verification_method?: string
    checkedAt?: string
    checked_at?: string
  }

  export class IntegrationClient {
    constructor(options: IntegrationClientOptions)
    getMembershipByWallet?(walletAddress: string): Promise<IntegrationMembershipResponse | null>
    membershipByWallet?(walletAddress: string): Promise<IntegrationMembershipResponse | null>
    getMembership?(walletAddress: string): Promise<IntegrationMembershipResponse | null>
    membership?(walletAddress: string): Promise<IntegrationMembershipResponse | null>

    verifyWallet?(walletAddress: string): Promise<IntegrationWalletVerificationResponse>
    verifyWalletAddress?(walletAddress: string): Promise<IntegrationWalletVerificationResponse>
    checkWallet?(walletAddress: string): Promise<IntegrationWalletVerificationResponse>
    verify?(walletAddress: string): Promise<IntegrationWalletVerificationResponse>
  }

  export default IntegrationClient
}
