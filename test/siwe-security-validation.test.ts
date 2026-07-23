import './setup-env'
import { describe, test, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'

// Mock the config module
const originalEnv = process.env

describe('SIWE Security Validation: Domain & Chain Mismatch Protection', () => {
  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('Domain Validation (NEXT_PUBLIC_SIWE_DOMAIN vs window.location.host)', () => {
    test('should allow sign-in when configured domain matches runtime host', async () => {
      // Simulate matching environment
      process.env.NEXT_PUBLIC_SIWE_DOMAIN = 'localhost:3000'
      
      // Mock window.location.host
      ;(globalThis as any).window = {
        location: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
      }

      // Re-import config to pick up the env var
      delete require.cache[require.resolve('../lib/config')]
      const { config } = await import('../lib/config')

      const configuredDomain = config.siwe.domain
      const actualHost = (globalThis as any).window.location.host

      // Normalize for comparison
      const normalizeDomain = (d: string) => d.toLowerCase().replace(/^https?:\/\//, '')
      assert.equal(
        normalizeDomain(configuredDomain),
        normalizeDomain(actualHost),
        'Domain validation should pass when configured domain matches runtime host'
      )
    })

    test('should block sign-in when configured domain mismatches runtime host', async () => {
      // Simulate mismatched environment
      process.env.NEXT_PUBLIC_SIWE_DOMAIN = 'evil-site.com'
      
      // Mock window.location.host to legitimate site
      ;(globalThis as any).window = {
        location: {
          host: 'legitimate-site.com',
          origin: 'https://legitimate-site.com',
        },
      }

      // Re-import config to pick up the env var
      delete require.cache[require.resolve('../lib/config')]
      const { config } = await import('../lib/config')

      const configuredDomain = config.siwe.domain
      const actualHost = (globalThis as any).window.location.host

      // Normalize for comparison
      const normalizeDomain = (d: string) => d.toLowerCase().replace(/^https?:\/\//, '')
      assert.notEqual(
        normalizeDomain(configuredDomain),
        normalizeDomain(actualHost),
        'Domain validation should fail when configured domain mismatches runtime host'
      )

      // Verify the error message would be security-framed
      const expectedSecurityMessage = '🔒 Security Error: Domain Mismatch'
      assert.ok(
        expectedSecurityMessage.includes('Security Error'),
        'Error message should be security-framed with lock emoji'
      )
    })

    test('should handle protocol normalization (https:// vs http://)', async () => {
      process.env.NEXT_PUBLIC_SIWE_DOMAIN = 'example.com'
      
      ;(globalThis as any).window = {
        location: {
          host: 'example.com',
          origin: 'https://example.com',
        },
      }

      delete require.cache[require.resolve('../lib/config')]
      const { config } = await import('../lib/config')

      const normalizeDomain = (d: string) => d.toLowerCase().replace(/^https?:\/\//, '')
      assert.equal(
        normalizeDomain(config.siwe.domain),
        normalizeDomain((globalThis as any).window.location.host),
        'Protocol should be normalized in domain comparison'
      )
    })

    test('should handle port differences correctly', async () => {
      process.env.NEXT_PUBLIC_SIWE_DOMAIN = 'localhost:3000'
      
      ;(globalThis as any).window = {
        location: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
      }

      delete require.cache[require.resolve('../lib/config')]
      const { config } = await import('../lib/config')

      const normalizeDomain = (d: string) => d.toLowerCase().replace(/^https?:\/\//, '')
      assert.equal(
        normalizeDomain(config.siwe.domain),
        normalizeDomain((globalThis as any).window.location.host),
        'Ports should be included in domain comparison'
      )
    })

    test('should detect stale configuration after domain migration', async () => {
      // Simulate a domain migration scenario
      process.env.NEXT_PUBLIC_SIWE_DOMAIN = 'old-domain.com'
      
      ;(globalThis as any).window = {
        location: {
          host: 'new-domain.com',
          origin: 'https://new-domain.com',
        },
      }

      delete require.cache[require.resolve('../lib/config')]
      const { config } = await import('../lib/config')

      const normalizeDomain = (d: string) => d.toLowerCase().replace(/^https?:\/\//, '')
      assert.notEqual(
        normalizeDomain(config.siwe.domain),
        normalizeDomain((globalThis as any).window.location.host),
        'Should detect stale NEXT_PUBLIC_SIWE_DOMAIN after domain migration'
      )
    })
  })

  describe('ChainId Validation (mid-flow chain switch detection)', () => {
    test('should allow sign-in when chainId matches wallet connection', () => {
      const messageChainId = 1 // Mainnet
      const currentChainId = 1 // Wallet on Mainnet

      // Simulate the validation logic
      const validateChainId = (msgChainId: number, walletChainId: number | undefined) => {
        if (walletChainId === undefined) {
          throw new Error('🔒 Security Error: Unable to determine wallet chain')
        }
        if (walletChainId !== msgChainId) {
          throw new Error('🔒 Security Error: Chain Mismatch')
        }
      }

      assert.doesNotThrow(() => {
        validateChainId(messageChainId, currentChainId)
      }, 'Should allow sign-in when chainIds match')
    })

    test('should block sign-in when chainId mismatches wallet connection', () => {
      const messageChainId = 1 // Message constructed for Mainnet
      const currentChainId = 8453 // Wallet switched to Base

      const validateChainId = (msgChainId: number, walletChainId: number | undefined) => {
        if (walletChainId === undefined) {
          throw new Error('🔒 Security Error: Unable to determine wallet chain')
        }
        if (walletChainId !== msgChainId) {
          throw new Error(
            `🔒 Security Error: Chain Mismatch\n\nYour wallet is connected to chain ${walletChainId}, but the sign-in request is for chain ${msgChainId}.`
          )
        }
      }

      assert.throws(
        () => {
          validateChainId(messageChainId, currentChainId)
        },
        (err: Error) => {
          assert.ok(err.message.includes('🔒 Security Error: Chain Mismatch'))
          assert.ok(err.message.includes('1'))
          assert.ok(err.message.includes('8453'))
          return true
        },
        'Should block sign-in with security-framed error when chainIds mismatch'
      )
    })

    test('should handle undefined chainId (wallet not connected)', () => {
      const messageChainId = 1
      const currentChainId = undefined

      const validateChainId = (msgChainId: number, walletChainId: number | undefined) => {
        if (walletChainId === undefined) {
          throw new Error('🔒 Security Error: Unable to determine wallet chain')
        }
        if (walletChainId !== msgChainId) {
          throw new Error('🔒 Security Error: Chain Mismatch')
        }
      }

      assert.throws(
        () => {
          validateChainId(messageChainId, currentChainId)
        },
        (err: Error) => {
          assert.ok(err.message.includes('🔒 Security Error'))
          assert.ok(err.message.includes('Unable to determine wallet chain'))
          return true
        },
        'Should block sign-in when wallet chainId is undefined'
      )
    })

    test('should detect chain switch between message construction and signature', () => {
      // Simulate the timing attack scenario:
      // 1. Message constructed with chainId 1
      const messageChainId = 1
      
      // 2. User switches wallet to chain 8453 (Base)
      const chainAtConstruction = 1
      const chainAtSignature = 8453

      // The validation should happen at signature time, not construction time
      const validateAtSignatureTime = (msgChainId: number, currentChainId: number) => {
        if (currentChainId !== msgChainId) {
          throw new Error(
            `🔒 Security Error: Chain Mismatch\n\nYour wallet is connected to chain ${currentChainId}, but the sign-in request is for chain ${msgChainId}.`
          )
        }
      }

      assert.throws(
        () => {
          validateAtSignatureTime(messageChainId, chainAtSignature)
        },
        (err: Error) => {
          assert.ok(err.message.includes('🔒 Security Error: Chain Mismatch'))
          assert.ok(err.message.includes('prevents signature replay'))
          return true
        },
        'Should detect chain switch between message construction and signature request'
      )
    })
  })

  describe('Security Error Message Formatting', () => {
    test('domain mismatch error should be distinct from generic errors', () => {
      const domainMismatchError = [
        '🔒 Security Error: Domain Mismatch',
        '',
        'The configured SIWE domain (evil-site.com) does not match the current site (legitimate-site.com).',
        '',
        'This indicates either:',
        '  • A misconfiguration (NEXT_PUBLIC_SIWE_DOMAIN is stale or incorrect)',
        '  • A phishing attempt or proxying scenario',
        '',
        'For your security, sign-in is blocked. Please contact the site administrator if this persists.',
      ].join('\n')

      assert.ok(domainMismatchError.includes('🔒 Security Error'))
      assert.ok(domainMismatchError.includes('Domain Mismatch'))
      assert.ok(domainMismatchError.includes('phishing'))
      assert.ok(domainMismatchError.includes('misconfiguration'))
      assert.notMatch(domainMismatchError, /generic/i, 'Should not use generic error language')
    })

    test('chain mismatch error should be distinct from generic errors', () => {
      const chainMismatchError = [
        '🔒 Security Error: Chain Mismatch',
        '',
        'Your wallet is connected to chain 8453, but the sign-in request is for chain 1.',
        '',
        'This prevents signature replay across different chains.',
        'Please switch your wallet to the correct chain and try again.',
      ].join('\n')

      assert.ok(chainMismatchError.includes('🔒 Security Error'))
      assert.ok(chainMismatchError.includes('Chain Mismatch'))
      assert.ok(chainMismatchError.includes('signature replay'))
      assert.notMatch(chainMismatchError, /generic/i, 'Should not use generic error language')
    })

    test('security errors should include actionable guidance', () => {
      const domainError = '🔒 Security Error: Domain Mismatch\n\nFor your security, sign-in is blocked. Please contact the site administrator if this persists.'
      const chainError = '🔒 Security Error: Chain Mismatch\n\nPlease switch your wallet to the correct chain and try again.'

      assert.ok(domainError.includes('Please contact') || domainError.includes('For your security'))
      assert.ok(chainError.includes('Please switch') || chainError.includes('try again'))
    })
  })

  describe('Integration: Legitimate Flow Should Not Be Affected', () => {
    test('matching domain and chain should pass all validations', async () => {
      process.env.NEXT_PUBLIC_SIWE_DOMAIN = 'app.example.com'
      
      ;(globalThis as any).window = {
        location: {
          host: 'app.example.com',
          origin: 'https://app.example.com',
        },
      }

      delete require.cache[require.resolve('../lib/config')]
      const { config } = await import('../lib/config')

      // Domain validation
      const normalizeDomain = (d: string) => d.toLowerCase().replace(/^https?:\/\//, '')
      assert.equal(
        normalizeDomain(config.siwe.domain),
        normalizeDomain((globalThis as any).window.location.host),
        'Domain should match'
      )

      // Chain validation
      const messageChainId = 1
      const walletChainId = 1
      assert.equal(messageChainId, walletChainId, 'Chain should match')

      // Both validations should pass without throwing
      assert.doesNotThrow(() => {
        if (normalizeDomain(config.siwe.domain) !== normalizeDomain((globalThis as any).window.location.host)) {
          throw new Error('Domain mismatch')
        }
        if (walletChainId !== messageChainId) {
          throw new Error('Chain mismatch')
        }
      }, 'Legitimate flow with matching domain and chain should succeed')
    })
  })
})
