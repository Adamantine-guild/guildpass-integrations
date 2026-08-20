/**
 * lib/api/mock/scenarios.ts
 *
 * Developer-testing controls for the mock API: scenario presets and the
 * full mock data reset. Extracted from lib/api/mock.ts.
 */
import { clearPersistedState } from '../mock-storage'
import { resetMockControls } from './controls'
import {
  getCommunityState,
  initPromise,
  resetCommunityStates,
  schedulePersist,
} from './state'

export type MockScenario =
  | 'active-member'
  | 'expired-member'
  | 'denied-resource'
  | 'admin-session-expired'
  | 'no-roles'
  | 'multiple-roles'
  | 'multiple-communities'
  | 'concurrent-policy-edit'
  | 'customized-profile'

/**
 * Reset all mock data to its initial state.
 */
export async function resetMockData() {
  await initPromise
  resetCommunityStates()
  resetMockControls()
  await clearPersistedState()
}

/**
 * Apply a predefined scenario preset for testing.
 */
export async function applyMockScenario(scenario: MockScenario, address: string = '0x1234567890123456789012345678901234567890') {
  await resetMockData()

  const demoState = getCommunityState('guildpass-demo')

  switch (scenario) {
    case 'active-member':
      demoState.memberStore[address] = {
        membership: {
          address,
          tier: 'standard',
          active: true,
        },
        roles: ['member'],
        profile: {
          address,
          displayName: 'Active Standard User',
          badges: ['Early Member', 'Standard Tier'],
        },
      }
      break

    case 'expired-member':
      demoState.memberStore[address] = {
        membership: {
          address,
          tier: 'standard',
          active: false,
          expiresAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        },
        roles: ['member'],
        profile: {
          address,
          displayName: 'Expired User',
          badges: ['Former Member'],
        },
      }
      break

    case 'denied-resource':
      demoState.memberStore[address] = {
        membership: {
          address,
          tier: 'free',
          active: true,
        },
        roles: ['member'],
        profile: {
          address,
          displayName: 'Free Tier User',
          badges: ['Free Tier'],
        },
      }
      // Ensure Alpha Docs require standard tier
      demoState.policies = demoState.policies.map(p =>
        p.resourceId === 'alpha'
          ? { ...p, minTier: 'standard' }
          : p
      )
      break

    case 'admin-session-expired':
      demoState.memberStore[address] = {
        membership: {
          address,
          tier: 'pro',
          active: true,
        },
        roles: ['admin', 'member'],
        profile: {
          address,
          displayName: 'Expired Admin',
          badges: ['Admin', 'Pro Tier'],
        },
      }
      break

    case 'no-roles':
      demoState.memberStore[address] = {
        membership: {
          address,
          tier: 'free',
          active: true,
        },
        roles: [],
        profile: {
          address,
          displayName: 'No Roles User',
          badges: ['New User'],
        },
      }
      break

    case 'multiple-roles':
      // 'admin' is included deliberately: it's the only role that changes
      // nav/admin-console visibility in this codebase (every first-party
      // module in lib/admin-modules/modules/*.ts requires it), so leaving it
      // out would make role-aware nav unverifiable. It does not bypass
      // tier-gated resource access (lib/api/access-decision.ts evaluates
      // tier independently of role), so alpha/pro-reports stay genuinely
      // tier-gated for this member.
      demoState.memberStore[address] = {
        membership: {
          address,
          tier: 'pro',
          active: true,
        },
        roles: ['admin', 'moderator', 'member'],
        profile: {
          address,
          displayName: 'Multi-Role Member',
          badges: ['Admin', 'Moderator'],
        },
      }
      break

    case 'multiple-communities':
      // Seed a member whose data reflects participation in more than one
      // community. The mock session model exposes a single active community,
      // so this preset points the active community at a multi-community hub
      // and marks the member's badges to reflect their other memberships.
      // Existing single-community presets are unaffected.
      const hubState = getCommunityState('guildpass-hub')
      hubState.community = {
        id: 'guildpass-hub',
        name: 'GuildPass Hub (Multi-Community)',
        description:
          'Shared hub for a member active across several communities',
        tiers: ['free', 'standard', 'pro'],
      }
      hubState.memberStore[address] = {
        membership: {
          address,
          tier: 'standard',
          active: true,
        },
        roles: ['member'],
        profile: {
          address,
          displayName: 'Multi-Community Member',
          badges: [
            'GuildPass Demo Community',
            'Builders Collective',
            'Design Guild',
          ],
        },
      }
      break

    case 'concurrent-policy-edit':
      // Set up a scenario to test concurrent policy editing
      demoState.memberStore[address] = {
        membership: {
          address,
          tier: 'pro',
          active: true,
        },
        roles: ['admin', 'member'],
        profile: {
          address,
          displayName: 'Admin Testing Concurrency',
          badges: ['Admin', 'Pro Tier'],
        },
      }
      // Update the 'alpha' policy with a very recent timestamp to simulate
      // another admin just having edited it
      const alphaIdx = demoState.policies.findIndex((p) => p.resourceId === 'alpha')
      if (alphaIdx >= 0) {
        demoState.policies[alphaIdx] = {
          ...demoState.policies[alphaIdx],
          updatedAt: new Date(Date.now() - 1000 * 5).toISOString(), // 5 seconds ago
          minTier: 'pro', // Changed from 'standard'
        }
      }
      break

    case 'customized-profile':
      // A member who has filled out every rich-profile field (#254), to
      // exercise the public profile view and editor pre-fill against a
      // fully-populated record rather than only the sparse defaults.
      demoState.memberStore[address] = {
        membership: {
          address,
          tier: 'standard',
          active: true,
        },
        roles: ['member'],
        profile: {
          address,
          displayName: 'Ada Lovelace',
          bio: 'Builder and early GuildPass member, exploring what token-gated communities can look like.',
          avatar: 'https://example.com/avatars/ada-lovelace.png',
          socialLinks: [
            { platform: 'twitter', url: 'https://example.com/twitter/ada' },
            { platform: 'github', url: 'https://example.com/github/ada' },
            { platform: 'website', url: 'https://example.com/ada' },
          ],
          badges: ['Early Member', 'Standard Tier'],
        },
      }
      break
  }
  schedulePersist()
}