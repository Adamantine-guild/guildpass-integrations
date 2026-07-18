import type { Role } from './types'

/**
 * Returns true when removing a role should require an explicit confirmation.
 *
 * Admin removal is sensitive because it changes governance access. Removing a
 * member's last role is also sensitive because it can leave the member without
 * any role-based access path.
 */
export function roleRemovalNeedsConfirmation(
  role: Role,
  currentRoles: readonly Role[],
): boolean {
  return role === 'admin' || currentRoles.length <= 1
}

export function roleRemovalConfirmationMessage(
  address: string,
  role: Role,
  currentRoles: readonly Role[],
): string | null {
  if (!roleRemovalNeedsConfirmation(role, currentRoles)) return null

  const reasons = []
  if (role === 'admin') reasons.push('the admin role')
  if (currentRoles.length <= 1) reasons.push("the member's last remaining role")

  return `Remove ${role} role from ${address}? This removes ${reasons.join(' and ')}.`
}
