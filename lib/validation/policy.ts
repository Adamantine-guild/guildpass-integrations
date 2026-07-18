import { AccessRuleSchema } from '../api/types'
import type { AccessPolicy, MembershipTier, Role } from '../api/types'

const ALLOWED_TIERS: MembershipTier[] = ['free', 'standard', 'pro']
const ALLOWED_ROLES: Role[] = ['member', 'moderator', 'admin']
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9_-]+$/

export type PolicyValidationErrors = Partial<
  Record<'resourceId' | 'minTier' | 'roles' | 'combination', string>
>

export class PolicyValidationError extends Error {
  readonly errors: PolicyValidationErrors

  constructor(errors: PolicyValidationErrors) {
    super('Invalid access policy')
    this.name = 'PolicyValidationError'
    this.errors = errors
  }
}

export function normalizeRoles(roles?: Role[]): Role[] | undefined {
  if (!roles?.length) return undefined
  return Array.from(new Set(roles))
}

export function validatePolicy(
  policy: AccessPolicy,
): { valid: true; value: AccessPolicy } | { valid: false; errors: PolicyValidationErrors } {
  const errors: PolicyValidationErrors = {}

  const resourceId = policy.resourceId?.trim()

  if (!resourceId) {
    errors.resourceId = 'Resource ID is required.'
  } else if (!RESOURCE_ID_PATTERN.test(resourceId)) {
    errors.resourceId =
      'Resource ID may only contain letters, numbers, hyphens, and underscores.'
  }

  if (policy.minTier !== undefined && !ALLOWED_TIERS.includes(policy.minTier)) {
    errors.minTier = 'Minimum tier must be one of free, standard, or pro.'
  }

  if (policy.roles) {
    const invalidRoles = policy.roles.filter((role) => !ALLOWED_ROLES.includes(role))
    if (invalidRoles.length > 0) {
      errors.roles = `Unsupported role value(s): ${invalidRoles.join(', ')}.`
    } else {
      const unique = new Set(policy.roles)
      if (unique.size !== policy.roles.length) {
        errors.roles = 'Duplicate roles are not allowed.'
      }
    }
  }

  const normalizedRoles = normalizeRoles(policy.roles)

  if (policy.rule !== undefined && !AccessRuleSchema.safeParse(policy.rule).success) {
    errors.combination = 'The composable access rule is malformed.'
  }

  // A composable rule tree is a restriction in its own right, so the legacy
  // minTier/roles combination requirements only apply when no rule is set.
  if (policy.rule === undefined) {
    if (!policy.minTier && (!normalizedRoles || normalizedRoles.length === 0)) {
      errors.combination =
        'Policy must define at least one restriction: a minimum tier or one or more roles.'
    }

    // Frontend contract assumption:
    // minTier=free with no roles effectively grants unrestricted access.
    if (policy.minTier === 'free' && (!normalizedRoles || normalizedRoles.length === 0)) {
      errors.combination =
        'A free-tier policy without role restrictions does not restrict access.'
    }
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors }
  }

  return {
    valid: true,
    value: {
      resourceId,
      minTier: policy.minTier,
      roles: normalizedRoles,
      ...(policy.rule !== undefined ? { rule: policy.rule } : {}),
    },
  }
}
