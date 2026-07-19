import type { Role, RoleCapability, Session } from './types'

export const ROLE_CAPABILITIES: Record<Role, RoleCapability[]> = {
  member: [],
  moderator: ['assign_roles', 'view_events'],
  admin: ['assign_roles', 'edit_policies', 'edit_settings', 'view_events'],
}

export function deriveRoleCapabilities(roles: Role[] = []): RoleCapability[] {
  return Array.from(new Set(roles.flatMap((role) => ROLE_CAPABILITIES[role] ?? [])))
}

export function capabilitiesForSession(session?: Pick<Session, 'roles' | 'capabilities'> | null): RoleCapability[] {
  if (!session) return []
  return session.capabilities ?? deriveRoleCapabilities(session.roles)
}

export function hasCapability(
  session: Pick<Session, 'roles' | 'capabilities'> | null | undefined,
  capability: RoleCapability,
): boolean {
  return capabilitiesForSession(session).includes(capability)
}
