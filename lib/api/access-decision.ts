import type {
  AccessDecision,
  AccessRule,
  MembershipTier,
  Role,
  Session,
} from './types'

const TIER_ORDER: MembershipTier[] = ['free', 'standard', 'pro']

/** The membership facts an access rule is evaluated against. */
export interface AccessSubject {
  tier?: MembershipTier
  roles: Role[]
  badges: string[]
}

/**
 * Recursively evaluate a composable access rule tree against a subject.
 *
 * Combinator identities: an 'and' with no rules evaluates to true, an 'or'
 * with no rules evaluates to false (so an empty 'or' can encode
 * "deny always", mirroring the legacy roles:[] behavior).
 */
export function evaluateAccessRule(rule: AccessRule, subject: AccessSubject): boolean {
  switch (rule.type) {
    case 'tier':
      return (
        subject.tier !== undefined &&
        TIER_ORDER.indexOf(subject.tier) >= TIER_ORDER.indexOf(rule.minTier)
      )
    case 'role':
      return subject.roles.includes(rule.role)
    case 'badge':
      return subject.badges.includes(rule.badge)
    case 'and':
      return rule.rules.every((nested) => evaluateAccessRule(nested, subject))
    case 'or':
      return rule.rules.some((nested) => evaluateAccessRule(nested, subject))
  }
}

/**
 * Wrap legacy single-condition requirements into an equivalent rule tree so
 * both policy shapes share one evaluation path:
 *
 * - minTier alone           → { type: 'tier', ... }
 * - roles alone             → OR over the roles (any listed role grants)
 * - minTier + roles         → AND(tier, OR(roles))
 * - roles: [] (empty array) → no role restriction, same as roles being unset.
 *   The API layer normalizes absent roles to [] on every policy, so an empty
 *   list must not be read as "no role can ever match".
 * - neither                 → undefined (no restriction)
 *
 * "Deny always" remains expressible as an explicit { type: 'or', rules: [] }.
 */
export function requirementsToRule(requirements: {
  minTier?: MembershipTier
  roles?: Role[]
}): AccessRule | undefined {
  const leaves: AccessRule[] = []

  if (requirements.minTier) {
    leaves.push({ type: 'tier', minTier: requirements.minTier })
  }
  if (requirements.roles && requirements.roles.length > 0) {
    leaves.push(
      requirements.roles.length === 1
        ? { type: 'role', role: requirements.roles[0] }
        : { type: 'or', rules: requirements.roles.map((role) => ({ type: 'role', role })) },
    )
  }

  if (leaves.length === 0) return undefined
  return leaves.length === 1 ? leaves[0] : { type: 'and', rules: leaves }
}

export function computeAccessDecision(
  session: Session | undefined,
  requirements: { minTier?: MembershipTier; roles?: Role[]; rule?: AccessRule },
): AccessDecision {
  const now = new Date().toISOString()

  if (!session || !session.membership) {
    return {
      allowed: false,
      reason: 'Your current membership does not grant access.',
      checkedAt: now,
    }
  }

  // An explicit rule tree takes precedence; legacy minTier/roles requirements
  // are wrapped into an equivalent single-path rule.
  const rule = requirements.rule ?? requirementsToRule(requirements)

  const subject: AccessSubject = {
    tier: session.membership.tier,
    roles: session.roles ?? [],
    badges: session.badges ?? [],
  }

  const meetsRule = rule ? evaluateAccessRule(rule, subject) : true

  if (!meetsRule || !session.membership.active) {
    return {
      allowed: false,
      reason: 'Your current membership does not grant access.',
      checkedAt: now,
    }
  }

  return {
    allowed: true,
    reason: 'Access granted.',
    checkedAt: now,
  }
}
