import { MemberRow, MembershipTier, MembershipTierSchema, Role, RoleSchema } from '../api/types';

/** Canonical option lists, in the order already declared on the enums — used for filter dropdowns instead of deriving from loaded data so options don't shift as more members load. */
export const ROLE_FILTER_OPTIONS: Role[] = RoleSchema.options;
export const TIER_FILTER_OPTIONS: MembershipTier[] = MembershipTierSchema.options;

export interface MemberFilters {
  search: string;
  role: Role | 'all';
  tier: MembershipTier | 'all';
}

/**
 * True when `member` satisfies every active filter (AND across search/role/
 * tier, ANY within a member's own roles array). Never mutates `member`.
 */
export function memberMatchesFilters(member: MemberRow, filters: MemberFilters): boolean {
  const term = filters.search.trim().toLowerCase();

  const matchesSearch =
    term === '' ||
    member.address.toLowerCase().includes(term) ||
    (member.displayName?.toLowerCase().includes(term) ?? false);

  const matchesRole = filters.role === 'all' || (member.roles ?? []).includes(filters.role);

  // Exact match only — an unrecognized tier value is simply excluded from a
  // specific filter (never coerced into one of the known tiers) and still
  // matches 'all'.
  const matchesTier = filters.tier === 'all' || member.tier === filters.tier;

  return matchesSearch && matchesRole && matchesTier;
}

/** Returns a new array (input order preserved, input never mutated). */
export function filterMembers(members: MemberRow[], filters: MemberFilters): MemberRow[] {
  return members.filter((member) => memberMatchesFilters(member, filters));
}
