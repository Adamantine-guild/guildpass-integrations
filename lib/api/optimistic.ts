import type { AccessPolicy, MemberProfile, MemberRow, Role } from './types'

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

export function applyOptimisticProfile(
  current: MemberProfile | null | undefined,
  update: MemberProfile,
): MemberProfile {
  return {
    address: update.address,
    displayName: update.displayName,
    bio: update.bio,
    avatar: update.avatar,
    socialLinks: update.socialLinks,
    // badges are system-assigned and never accepted from the client — always
    // carry forward whatever is already cached rather than the submitted value.
    badges: current?.badges ?? [],
  }
}
