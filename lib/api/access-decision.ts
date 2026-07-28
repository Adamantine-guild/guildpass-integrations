import type {
  AccessDecision,
  AccessRule,
  Membership,
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

const NO_MEMBERSHIP_REASON = 'You do not have an active membership for this community.'
const COMPLEX_RULE_REASON = "Your membership does not satisfy this resource's access requirements."

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * Format an expiry timestamp for display, or `undefined` if it isn't a
 * parseable date. Purely a display concern — whether a membership is treated
 * as expired is always decided by `membership.active`, never by comparing
 * this value to "now".
 */
function formatReliableExpiry(expiresAt: string | undefined): string | undefined {
  if (!expiresAt) return undefined
  const parsed = new Date(expiresAt)
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function describeExpiredMembership(membership: Membership): string {
  const formatted = formatReliableExpiry(membership.expiresAt)
  const dateClause = formatted ? ` It expired on ${formatted}.` : ''
  return `Your membership has expired or is inactive.${dateClause} Renew to regain access.`
}

function tierDenialReason(minTier: MembershipTier, currentTier?: MembershipTier): string {
  const required = capitalize(minTier)
  if (!currentTier) {
    return `This resource requires the ${required} tier or higher. Your account has no membership tier on record.`
  }
  return `This resource requires the ${required} tier or higher. You're currently on the ${capitalize(currentTier)} tier.`
}

function roleDenialReason(roles: Role[]): string {
  if (roles.length === 1) {
    return `This resource requires the "${roles[0]}" role, which your account does not have.`
  }
  return `This resource requires one of the following roles: ${roles.join(', ')}. Your account does not have any of them.`
}

type RuleDenialShape =
  | { kind: 'tier'; minTier: MembershipTier }
  | { kind: 'roles'; roles: Role[] }
  | { kind: 'and-tier-roles'; minTier: MembershipTier; roles: Role[] }
  | { kind: 'complex' }

/**
 * Classify a rule tree into a shape simple enough to describe honestly.
 * Only shapes where the failing condition is provable from the subject get a
 * specific classification (a lone tier/role leaf, an OR of only role leaves,
 * or an AND of exactly one tier leaf and one roles-only leaf). Anything else
 * — badge leaves, ORs that mix roles with tier/badge conditions, nested
 * AND/OR trees — is 'complex', so callers fall back to generic copy instead
 * of guessing which leaf actually failed.
 */
export function classifyRuleForDenial(rule: AccessRule): RuleDenialShape {
  if (rule.type === 'tier') return { kind: 'tier', minTier: rule.minTier }
  if (rule.type === 'role') return { kind: 'roles', roles: [rule.role] }
  if (rule.type === 'or' && rule.rules.length > 0 && rule.rules.every((r) => r.type === 'role')) {
    return { kind: 'roles', roles: rule.rules.map((r) => (r as { type: 'role'; role: Role }).role) }
  }
  if (rule.type === 'and' && rule.rules.length === 2) {
    const [a, b] = rule.rules.map(classifyRuleForDenial)
    const tierPart = a.kind === 'tier' ? a : b.kind === 'tier' ? b : undefined
    const rolesPart = a.kind === 'roles' ? a : b.kind === 'roles' ? b : undefined
    if (tierPart && rolesPart) {
      return { kind: 'and-tier-roles', minTier: tierPart.minTier, roles: rolesPart.roles }
    }
  }
  return { kind: 'complex' }
}

/**
 * Describe why a rule failed without claiming a cause that can't be proven
 * from the subject. For the AND(tier, roles) shape, tier is checked first —
 * mirroring the reason precedence (insufficient tier ranks above missing
 * role) — so exactly one explanation is ever returned, never a merged one.
 */
export function describeRuleFailure(rule: AccessRule, subject: AccessSubject): string {
  const shape = classifyRuleForDenial(rule)
  switch (shape.kind) {
    case 'tier':
      return tierDenialReason(shape.minTier, subject.tier)
    case 'roles':
      return roleDenialReason(shape.roles)
    case 'and-tier-roles': {
      const tierMet = evaluateAccessRule({ type: 'tier', minTier: shape.minTier }, subject)
      return tierMet ? roleDenialReason(shape.roles) : tierDenialReason(shape.minTier, subject.tier)
    }
    case 'complex':
    default:
      return COMPLEX_RULE_REASON
  }
}

/**
 * Compute the specific, safe-to-display reason a member is denied access,
 * following the precedence: missing membership → expired/inactive →
 * insufficient tier → missing role → generic complex-rule fallback.
 */
export function describeDenialReason(
  session: Session | undefined,
  rule: AccessRule | undefined,
): string {
  if (!session || !session.membership) {
    return NO_MEMBERSHIP_REASON
  }

  const { membership } = session
  if (!membership.active) {
    return describeExpiredMembership(membership)
  }

  if (!rule) {
    return COMPLEX_RULE_REASON
  }

  const subject: AccessSubject = {
    tier: membership.tier,
    roles: session.roles ?? [],
    badges: session.badges ?? [],
  }

  return describeRuleFailure(rule, subject)
}

export function computeAccessDecision(
  session: Session | undefined,
  requirements: { minTier?: MembershipTier; roles?: Role[]; rule?: AccessRule },
): AccessDecision {
  const now = new Date().toISOString()

  if (!session || !session.membership) {
    return {
      allowed: false,
      reason: describeDenialReason(session, undefined),
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
      reason: describeDenialReason(session, rule),
      checkedAt: now,
    }
  }

  return {
    allowed: true,
    reason: 'Access granted.',
    checkedAt: now,
  }
}
