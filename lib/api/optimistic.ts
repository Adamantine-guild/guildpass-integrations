import type { AccessPolicy, MemberRow, Role } from './types'

export function applyOptimisticRole(
  members: MemberRow[] | undefined,
  address: string,
  role: Role,
): MemberRow[] {
  const currentMembers = members ?? []
  const memberIndex = currentMembers.findIndex(
    (member) => member.address.toLowerCase() === address.toLowerCase(),
  )

  if (memberIndex === -1) {
    return [
      ...currentMembers,
      {
        address,
        roles: [role],
        tier: 'free',
        active: true,
      },
    ]
  }

  return currentMembers.map((member, index) => {
    if (index !== memberIndex || member.roles.includes(role)) return member
    return {
      ...member,
      roles: [...member.roles, role],
    }
  })
}

export function applyOptimisticRemoveRole(
  members: MemberRow[] | undefined,
  address: string,
  role: Role,
): MemberRow[] {
  const currentMembers = members ?? []
  return currentMembers.map((member) => {
    if (member.address.toLowerCase() !== address.toLowerCase()) return member
    return {
      ...member,
      roles: member.roles.filter((r) => r !== role),
    }
  })
}

export function applyOptimisticPolicy(
  policies: AccessPolicy[] | undefined,
  policy: AccessPolicy,
): AccessPolicy[] {
  const currentPolicies = policies ?? []
  const policyIndex = currentPolicies.findIndex(
    (currentPolicy) => currentPolicy.resourceId === policy.resourceId,
  )

  if (policyIndex === -1) {
    return [...currentPolicies, policy]
  }

  return currentPolicies.map((currentPolicy, index) =>
    index === policyIndex ? policy : currentPolicy,
  )
}
