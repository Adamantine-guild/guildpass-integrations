import './setup-env'
import './setup-alias'
import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  computeAccessDecision,
  describeDenialReason,
  classifyRuleForDenial,
} from '../lib/api/access-decision'
import type { AccessRule, Session } from '../lib/api/types'
import { MockAccessApi, applyMockScenario, resetMockData } from '../lib/api/mock'
import { AccessDenied } from '../components/gated'
import UpgradePage from '../app/[communitySlug]/upgrade/page'

const ADDRESS = '0x1234567890123456789012345678901234567890'

function session(overrides: {
  tier?: 'free' | 'standard' | 'pro'
  active?: boolean
  expiresAt?: string
  roles?: Session['roles']
  badges?: string[]
} = {}): Session {
  return {
    address: ADDRESS,
    roles: overrides.roles ?? [],
    membership: {
      address: ADDRESS,
      tier: overrides.tier ?? 'free',
      active: overrides.active ?? true,
      expiresAt: overrides.expiresAt,
    },
    badges: overrides.badges ?? [],
  }
}

// Mirrors the real "Moderator Lounge" policy rule from lib/api/mock.ts.
const MOD_LOUNGE_RULE: AccessRule = {
  type: 'and',
  rules: [
    { type: 'tier', minTier: 'standard' },
    { type: 'role', role: 'moderator' },
  ],
}

// Mirrors the real "Insider Hub" policy rule from lib/api/mock.ts.
const INSIDER_HUB_RULE: AccessRule = {
  type: 'or',
  rules: [
    { type: 'tier', minTier: 'pro' },
    { type: 'badge', badge: 'Early Member' },
  ],
}

// ── describeDenialReason: precedence ─────────────────────────────────────────

describe('describeDenialReason precedence', () => {
  test('no session -> missing-membership copy', () => {
    const reason = describeDenialReason(undefined, { type: 'tier', minTier: 'free' })
    assert.match(reason, /active membership/i)
  })

  test('session without membership -> missing-membership copy', () => {
    const reason = describeDenialReason({ address: ADDRESS, roles: [] }, { type: 'tier', minTier: 'free' })
    assert.match(reason, /active membership/i)
  })

  test('inactive membership without expiresAt -> expired/inactive copy, no date claim', () => {
    const s = session({ active: false })
    const reason = describeDenialReason(s, { type: 'tier', minTier: 'free' })
    assert.match(reason, /expired or is inactive/i)
    assert.doesNotMatch(reason, /\d{4}/)
  })

  test('inactive membership with a valid expiresAt -> includes a formatted date (semantic check only)', () => {
    const s = session({ active: false, expiresAt: '2026-01-15T00:00:00.000Z' })
    const reason = describeDenialReason(s, { type: 'tier', minTier: 'free' })
    assert.match(reason, /expired or is inactive/i)
    // Only the year is asserted — the exact locale-formatted date string is
    // intentionally not asserted here (avoids locale-sensitive brittleness).
    assert.match(reason, /2026/)
  })

  test('inactive membership with an invalid expiresAt -> falls back safely without throwing', () => {
    const s = session({ active: false, expiresAt: 'not-a-real-date' })
    assert.doesNotThrow(() => describeDenialReason(s, { type: 'tier', minTier: 'free' }))
    const reason = describeDenialReason(s, { type: 'tier', minTier: 'free' })
    assert.match(reason, /expired or is inactive/i)
    assert.doesNotMatch(reason, /not-a-real-date/)
  })

  test('active membership below required tier -> names current and required tier', () => {
    const s = session({ tier: 'free', active: true })
    const reason = describeDenialReason(s, { type: 'tier', minTier: 'standard' })
    assert.match(reason, /Standard/)
    assert.match(reason, /Free/)
  })

  test('active membership missing a single required role -> singular grammar', () => {
    const s = session({ tier: 'pro', active: true, roles: ['member'] })
    const reason = describeDenialReason(s, { type: 'role', role: 'admin' })
    assert.match(reason, /"admin"/)
    assert.doesNotMatch(reason, /one of the following/i)
  })

  test('active membership missing all of several acceptable roles -> plural grammar', () => {
    const s = session({ tier: 'pro', active: true, roles: ['member'] })
    const rule: AccessRule = {
      type: 'or',
      rules: [{ type: 'role', role: 'moderator' }, { type: 'role', role: 'admin' }],
    }
    const reason = describeDenialReason(s, rule)
    assert.match(reason, /moderator/)
    assert.match(reason, /admin/)
    assert.match(reason, /one of the following/i)
  })

  test('composable AND(tier, role): tier failing wins the deterministic tiebreak over role', () => {
    const s = session({ tier: 'free', active: true, roles: ['moderator'] })
    const reason = describeDenialReason(s, MOD_LOUNGE_RULE)
    assert.match(reason, /Standard/)
    assert.doesNotMatch(reason, /moderator/)
  })

  test('composable AND(tier, role): role is reported once tier is already met', () => {
    const s = session({ tier: 'standard', active: true, roles: [] })
    const reason = describeDenialReason(s, MOD_LOUNGE_RULE)
    assert.match(reason, /"moderator"/)
    assert.doesNotMatch(reason, /tier or higher/i)
  })

  test('composable OR(tier, badge) falls back to safe generic copy, not a tier/role claim', () => {
    const s = session({ tier: 'free', active: true, roles: [] })
    const reason = describeDenialReason(s, INSIDER_HUB_RULE)
    assert.match(reason, /does not satisfy/i)
    assert.doesNotMatch(reason, /Pro tier/i)
  })

  test('deny-always empty OR rule falls back to generic copy', () => {
    const s = session({ tier: 'pro', active: true, roles: ['admin'] })
    const reason = describeDenialReason(s, { type: 'or', rules: [] })
    assert.match(reason, /does not satisfy/i)
  })
})

// ── classifyRuleForDenial: only provable shapes get a specific label ────────

describe('classifyRuleForDenial', () => {
  test('classifies a bare tier leaf', () => {
    assert.deepEqual(classifyRuleForDenial({ type: 'tier', minTier: 'pro' }), { kind: 'tier', minTier: 'pro' })
  })

  test('classifies a bare role leaf', () => {
    assert.deepEqual(classifyRuleForDenial({ type: 'role', role: 'admin' }), { kind: 'roles', roles: ['admin'] })
  })

  test('classifies an OR of only role leaves as roles', () => {
    const rule: AccessRule = { type: 'or', rules: [{ type: 'role', role: 'admin' }, { type: 'role', role: 'moderator' }] }
    assert.deepEqual(classifyRuleForDenial(rule), { kind: 'roles', roles: ['admin', 'moderator'] })
  })

  test('classifies a badge leaf as complex', () => {
    assert.deepEqual(classifyRuleForDenial({ type: 'badge', badge: 'Early Member' }), { kind: 'complex' })
  })

  test('classifies AND(tier, role) as and-tier-roles', () => {
    assert.deepEqual(classifyRuleForDenial(MOD_LOUNGE_RULE), {
      kind: 'and-tier-roles',
      minTier: 'standard',
      roles: ['moderator'],
    })
  })

  test('classifies OR(tier, badge) as complex', () => {
    assert.deepEqual(classifyRuleForDenial(INSIDER_HUB_RULE), { kind: 'complex' })
  })
})

// ── computeAccessDecision: allow/deny semantics are unchanged ───────────────

describe('computeAccessDecision keeps existing allow/deny semantics', () => {
  test('meets minTier alone -> allowed', () => {
    const decision = computeAccessDecision(session({ tier: 'standard' }), { minTier: 'free' })
    assert.equal(decision.allowed, true)
  })

  test('meets composable AND(tier, role) -> allowed', () => {
    const decision = computeAccessDecision(
      session({ tier: 'standard', roles: ['moderator'] }),
      { rule: MOD_LOUNGE_RULE },
    )
    assert.equal(decision.allowed, true)
  })

  test('meets composable OR(tier, badge) via badge alone -> allowed', () => {
    const decision = computeAccessDecision(
      session({ tier: 'free', badges: ['Early Member'] }),
      { rule: INSIDER_HUB_RULE },
    )
    assert.equal(decision.allowed, true)
  })

  test('fails composable AND(tier, role) -> denied, with a specific reason', () => {
    const decision = computeAccessDecision(
      session({ tier: 'free', roles: ['moderator'] }),
      { rule: MOD_LOUNGE_RULE },
    )
    assert.equal(decision.allowed, false)
    assert.match(decision.reason, /Standard/)
  })

  test('reason text never leaks the wallet address', () => {
    const decision = computeAccessDecision(session({ tier: 'free' }), { minTier: 'standard' })
    assert.doesNotMatch(decision.reason, /0x/i)
  })
})

// ── Mock scenario presets produce the expected denial state ─────────────────

describe('mock scenario presets', () => {
  beforeEach(async () => {
    await resetMockData()
  })

  async function decide(resourceId: string) {
    const api = new MockAccessApi(ADDRESS)
    const [s, policy] = await Promise.all([api.getSession(), api.getPolicy(resourceId)])
    assert.ok(policy)
    return computeAccessDecision(s, policy!)
  }

  test('"Denied Resource" preset produces insufficient-tier copy for the alpha resource', async () => {
    await applyMockScenario('denied-resource', ADDRESS)
    const decision = await decide('alpha')
    assert.equal(decision.allowed, false)
    assert.match(decision.reason, /Standard/)
    assert.match(decision.reason, /Free/)
  })

  test('"Expired Member" preset produces expired/inactive copy', async () => {
    await applyMockScenario('expired-member', ADDRESS)
    const api = new MockAccessApi(ADDRESS)
    const s = await api.getSession()
    const decision = computeAccessDecision(s, { minTier: 'free' })
    assert.equal(decision.allowed, false)
    assert.match(decision.reason, /expired or is inactive/i)
  })

  test('"No Roles" preset against the mod-lounge policy yields the deterministic tier explanation', async () => {
    await applyMockScenario('no-roles', ADDRESS)
    const decision = await decide('mod-lounge')
    assert.equal(decision.allowed, false)
    assert.match(decision.reason, /Standard/)
  })
})

// ── AccessDenied CTA ──────────────────────────────────────────────────────────

describe('AccessDenied CTA', () => {
  test('renders a real link to the community-scoped upgrade route, not a disabled button', () => {
    const html = renderToStaticMarkup(React.createElement(AccessDenied, { reason: 'Test reason' }))
    assert.match(html, /href="\/guildpass-demo\/upgrade"/)
    // Tailwind's `disabled:opacity-50` variant class is present on every
    // buttonVariants() element regardless of state, so assert on the actual
    // disabled markers/element type rather than the substring "disabled".
    assert.doesNotMatch(html, /aria-disabled/)
    assert.doesNotMatch(html, /<button/)
    assert.doesNotMatch(html, /Coming soon/)
  })

  test('preserves resourceId in the upgrade link query string, safely encoded', () => {
    const html = renderToStaticMarkup(
      React.createElement(AccessDenied, { reason: 'Test reason', resourceId: 'alpha docs' }),
    )
    assert.match(html, /href="\/guildpass-demo\/upgrade\?resourceId=alpha%20docs"/)
  })

  test('always includes a working Back to Dashboard link', () => {
    const html = renderToStaticMarkup(React.createElement(AccessDenied, { reason: 'Test reason' }))
    assert.match(html, /href="\/guildpass-demo\/dashboard"/)
  })
})

// ── Upgrade page placeholder content ─────────────────────────────────────────

describe('Upgrade page placeholder content', () => {
  test('renders heading, status/tier/role guidance, a not-available notice, and a dashboard link', () => {
    const html = renderToStaticMarkup(
      UpgradePage({ params: { communitySlug: 'guildpass-demo' }, searchParams: {} }),
    )
    assert.match(html, /Upgrade or Renew Membership/)
    assert.match(html, /membership is active/i)
    assert.match(html, /tier/i)
    assert.match(html, /role/i)
    assert.match(html, /not yet available/i)
    assert.match(html, /href="\/guildpass-demo\/dashboard"/)
    assert.doesNotMatch(html, /successfully renewed/i)
    assert.doesNotMatch(html, /payment (successful|complete)/i)
  })

  test('surfaces the resourceId query param as context when present', () => {
    const html = renderToStaticMarkup(
      UpgradePage({ params: { communitySlug: 'guildpass-demo' }, searchParams: { resourceId: 'alpha' } }),
    )
    assert.match(html, /alpha/)
  })
})
