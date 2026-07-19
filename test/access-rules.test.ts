import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import './setup-env'
import {
  AccessSubject,
  computeAccessDecision,
  evaluateAccessRule,
  requirementsToRule,
} from '../lib/api/access-decision'
import { AccessRule, AccessRuleSchema, Session } from '../lib/api/types'
import { MockAccessApi, applyMockScenario, resetMockData } from '../lib/api/mock'

const ADDRESS = '0x1234567890123456789012345678901234567890'

function subject(overrides: Partial<AccessSubject> = {}): AccessSubject {
  return { tier: 'free', roles: [], badges: [], ...overrides }
}

function session(overrides: {
  tier?: 'free' | 'standard' | 'pro'
  active?: boolean
  roles?: Session['roles']
  badges?: string[]
}): Session {
  return {
    address: ADDRESS,
    roles: overrides.roles ?? [],
    membership: {
      address: ADDRESS,
      tier: overrides.tier ?? 'free',
      active: overrides.active ?? true,
    },
    badges: overrides.badges ?? [],
  }
}

// ── evaluateAccessRule: primitive conditions ─────────────────────────────────

describe('evaluateAccessRule primitives', () => {
  test('tier rule respects the tier ordering', () => {
    const rule: AccessRule = { type: 'tier', minTier: 'standard' }
    assert.equal(evaluateAccessRule(rule, subject({ tier: 'free' })), false)
    assert.equal(evaluateAccessRule(rule, subject({ tier: 'standard' })), true)
    assert.equal(evaluateAccessRule(rule, subject({ tier: 'pro' })), true)
  })

  test('tier rule fails when the subject has no tier', () => {
    const rule: AccessRule = { type: 'tier', minTier: 'free' }
    assert.equal(evaluateAccessRule(rule, subject({ tier: undefined })), false)
  })

  test('role rule requires the exact role', () => {
    const rule: AccessRule = { type: 'role', role: 'moderator' }
    assert.equal(evaluateAccessRule(rule, subject({ roles: ['member'] })), false)
    assert.equal(evaluateAccessRule(rule, subject({ roles: ['member', 'moderator'] })), true)
  })

  test('badge rule requires the exact badge', () => {
    const rule: AccessRule = { type: 'badge', badge: 'Early Member' }
    assert.equal(evaluateAccessRule(rule, subject({ badges: [] })), false)
    assert.equal(evaluateAccessRule(rule, subject({ badges: ['Early Member'] })), true)
  })
})

// ── evaluateAccessRule: compositions ─────────────────────────────────────────

describe('evaluateAccessRule compositions', () => {
  test('and requires every nested rule', () => {
    const rule: AccessRule = {
      type: 'and',
      rules: [
        { type: 'tier', minTier: 'standard' },
        { type: 'role', role: 'moderator' },
      ],
    }
    assert.equal(evaluateAccessRule(rule, subject({ tier: 'standard', roles: ['moderator'] })), true)
    assert.equal(evaluateAccessRule(rule, subject({ tier: 'standard', roles: ['member'] })), false)
    assert.equal(evaluateAccessRule(rule, subject({ tier: 'free', roles: ['moderator'] })), false)
  })

  test('or requires any nested rule', () => {
    const rule: AccessRule = {
      type: 'or',
      rules: [
        { type: 'tier', minTier: 'pro' },
        { type: 'badge', badge: 'Early Member' },
      ],
    }
    assert.equal(evaluateAccessRule(rule, subject({ tier: 'pro' })), true)
    assert.equal(evaluateAccessRule(rule, subject({ tier: 'free', badges: ['Early Member'] })), true)
    assert.equal(evaluateAccessRule(rule, subject({ tier: 'free' })), false)
  })

  test('nested composition: or containing and', () => {
    // pro OR (standard AND moderator)
    const rule: AccessRule = {
      type: 'or',
      rules: [
        { type: 'tier', minTier: 'pro' },
        {
          type: 'and',
          rules: [
            { type: 'tier', minTier: 'standard' },
            { type: 'role', role: 'moderator' },
          ],
        },
      ],
    }
    assert.equal(evaluateAccessRule(rule, subject({ tier: 'pro' })), true)
    assert.equal(evaluateAccessRule(rule, subject({ tier: 'standard', roles: ['moderator'] })), true)
    assert.equal(evaluateAccessRule(rule, subject({ tier: 'standard', roles: ['member'] })), false)
    assert.equal(evaluateAccessRule(rule, subject({ tier: 'free', roles: ['moderator'] })), false)
  })

  test('three-level nesting: and(or(and(...), badge), tier)', () => {
    // (((standard AND moderator) OR VIP badge) AND free tier floor)
    const rule: AccessRule = {
      type: 'and',
      rules: [
        {
          type: 'or',
          rules: [
            {
              type: 'and',
              rules: [
                { type: 'tier', minTier: 'standard' },
                { type: 'role', role: 'moderator' },
              ],
            },
            { type: 'badge', badge: 'VIP' },
          ],
        },
        { type: 'tier', minTier: 'free' },
      ],
    }
    assert.equal(evaluateAccessRule(rule, subject({ tier: 'standard', roles: ['moderator'] })), true)
    assert.equal(evaluateAccessRule(rule, subject({ tier: 'free', badges: ['VIP'] })), true)
    assert.equal(evaluateAccessRule(rule, subject({ tier: 'standard', roles: ['member'] })), false)
    assert.equal(evaluateAccessRule(rule, subject({ tier: undefined, badges: ['VIP'] })), false)
  })

  test('combinator identities: empty and is true, empty or is false', () => {
    assert.equal(evaluateAccessRule({ type: 'and', rules: [] }, subject()), true)
    assert.equal(evaluateAccessRule({ type: 'or', rules: [] }, subject()), false)
  })
})

// ── Legacy requirement wrapping ──────────────────────────────────────────────

describe('requirementsToRule legacy wrapper', () => {
  test('no requirements produce no rule', () => {
    assert.equal(requirementsToRule({}), undefined)
    assert.equal(requirementsToRule({ roles: [] }), undefined)
  })

  test('minTier alone becomes a single tier leaf', () => {
    assert.deepEqual(requirementsToRule({ minTier: 'pro' }), { type: 'tier', minTier: 'pro' })
  })

  test('a single role becomes a single role leaf', () => {
    assert.deepEqual(requirementsToRule({ roles: ['admin'] }), { type: 'role', role: 'admin' })
  })

  test('multiple roles become an or (any listed role grants)', () => {
    assert.deepEqual(requirementsToRule({ roles: ['admin', 'moderator'] }), {
      type: 'or',
      rules: [
        { type: 'role', role: 'admin' },
        { type: 'role', role: 'moderator' },
      ],
    })
  })

  test('minTier plus roles become and(tier, or(roles))', () => {
    assert.deepEqual(requirementsToRule({ minTier: 'standard', roles: ['admin', 'moderator'] }), {
      type: 'and',
      rules: [
        { type: 'tier', minTier: 'standard' },
        {
          type: 'or',
          rules: [
            { type: 'role', role: 'admin' },
            { type: 'role', role: 'moderator' },
          ],
        },
      ],
    })
  })

  test('legacy and rule-based requirements agree for single conditions', () => {
    const cases: Array<{ s: Session; minTier?: 'free' | 'standard' | 'pro'; roles?: Session['roles'] }> = [
      { s: session({ tier: 'standard' }), minTier: 'free' },
      { s: session({ tier: 'free' }), minTier: 'standard' },
      { s: session({ tier: 'pro', roles: ['admin'] }), roles: ['admin'] },
      { s: session({ tier: 'pro', roles: ['member'] }), roles: ['admin'] },
      { s: session({ tier: 'pro', roles: ['admin'], active: false }), minTier: 'free' },
    ]
    for (const { s, minTier, roles } of cases) {
      const legacy = computeAccessDecision(s, { minTier, roles })
      const viaRule = computeAccessDecision(s, { rule: requirementsToRule({ minTier, roles }) })
      assert.equal(legacy.allowed, viaRule.allowed)
    }
  })
})

// ── computeAccessDecision with rule trees ────────────────────────────────────

describe('computeAccessDecision with rules', () => {
  test('an explicit rule takes precedence over legacy requirements', () => {
    const decision = computeAccessDecision(session({ tier: 'free', badges: ['Early Member'] }), {
      minTier: 'pro',
      rule: { type: 'badge', badge: 'Early Member' },
    })
    assert.equal(decision.allowed, true)
  })

  test('inactive membership denies even when the rule matches', () => {
    const decision = computeAccessDecision(session({ tier: 'pro', active: false }), {
      rule: { type: 'tier', minTier: 'free' },
    })
    assert.equal(decision.allowed, false)
  })

  test('missing session denies regardless of rule', () => {
    const decision = computeAccessDecision(undefined, { rule: { type: 'and', rules: [] } })
    assert.equal(decision.allowed, false)
  })
})

// ── Mock scenarios evaluate identically under the new model ──────────────────

describe('existing mock scenarios (against the alpha policy)', () => {
  beforeEach(() => resetMockData())

  async function decideAlpha(scenario: Parameters<typeof applyMockScenario>[0]) {
    applyMockScenario(scenario, ADDRESS)
    const api = new MockAccessApi(ADDRESS)
    const [s, policy] = await Promise.all([api.getSession(), api.getPolicy('alpha')])
    assert.ok(policy)
    return computeAccessDecision(s, policy!)
  }

  test('Active Member (standard, active) is allowed', async () => {
    assert.equal((await decideAlpha('active-member')).allowed, true)
  })

  test('Expired Member (standard, inactive) is denied', async () => {
    assert.equal((await decideAlpha('expired-member')).allowed, false)
  })

  test('Denied Resource (free tier) is denied', async () => {
    assert.equal((await decideAlpha('denied-resource')).allowed, false)
  })

  test('No Roles (free tier, no roles) is denied', async () => {
    assert.equal((await decideAlpha('no-roles')).allowed, false)
  })
})

// ── New composable mock policies ─────────────────────────────────────────────

describe('composable mock policies', () => {
  beforeEach(() => resetMockData())

  test('mod-lounge policy is a genuine AND of tier and role', async () => {
    const policy = await new MockAccessApi(ADDRESS).getPolicy('mod-lounge')
    assert.ok(policy?.rule)
    assert.equal(policy!.rule!.type, 'and')

    // Both conditions met → allowed
    assert.equal(
      computeAccessDecision(session({ tier: 'standard', roles: ['moderator'] }), policy!).allowed,
      true,
    )
    // Tier alone is not enough
    assert.equal(
      computeAccessDecision(session({ tier: 'pro', roles: ['member'] }), policy!).allowed,
      false,
    )
    // Role alone is not enough
    assert.equal(
      computeAccessDecision(session({ tier: 'free', roles: ['moderator'] }), policy!).allowed,
      false,
    )
  })

  test('insider-hub policy is a genuine OR of tier and badge', async () => {
    const policy = await new MockAccessApi(ADDRESS).getPolicy('insider-hub')
    assert.ok(policy?.rule)
    assert.equal(policy!.rule!.type, 'or')

    // Pro tier alone grants
    assert.equal(computeAccessDecision(session({ tier: 'pro' }), policy!).allowed, true)
    // Badge alone grants, even on the free tier
    assert.equal(
      computeAccessDecision(session({ tier: 'free', badges: ['Early Member'] }), policy!).allowed,
      true,
    )
    // Neither → denied
    assert.equal(computeAccessDecision(session({ tier: 'free' }), policy!).allowed, false)
  })

  test('mock sessions expose the badges used by badge rules', async () => {
    applyMockScenario('active-member', ADDRESS)
    const s = await new MockAccessApi(ADDRESS).getSession()
    assert.ok(Array.isArray(s.badges))
  })
})

// ── Schema validation of rule trees ──────────────────────────────────────────

describe('AccessRuleSchema', () => {
  test('accepts a nested rule tree', () => {
    const rule: AccessRule = {
      type: 'or',
      rules: [
        { type: 'tier', minTier: 'pro' },
        { type: 'and', rules: [{ type: 'role', role: 'moderator' }, { type: 'badge', badge: 'VIP' }] },
      ],
    }
    assert.equal(AccessRuleSchema.safeParse(rule).success, true)
  })

  test('rejects malformed nodes', () => {
    assert.equal(AccessRuleSchema.safeParse({ type: 'tier' }).success, false)
    assert.equal(AccessRuleSchema.safeParse({ type: 'nope', rules: [] }).success, false)
    assert.equal(
      AccessRuleSchema.safeParse({ type: 'and', rules: [{ type: 'role' }] }).success,
      false,
    )
  })
})
