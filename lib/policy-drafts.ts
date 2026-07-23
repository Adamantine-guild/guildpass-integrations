import type { AccessPolicy, MembershipTier, Role } from './api/types'

const POLICY_DRAFTS_KEY = 'guildpass:policy-drafts'

export type PolicyDraft = {
  resourceId: string
  minTier?: MembershipTier
  roles: Role[]
}

type PolicyDraftStore = Record<string, PolicyDraft>

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

function readDrafts(): PolicyDraftStore {
  if (!canUseSessionStorage()) return {}

  try {
    const raw = window.sessionStorage.getItem(POLICY_DRAFTS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as PolicyDraftStore
  } catch {
    return {}
  }
}

function writeDrafts(drafts: PolicyDraftStore): void {
  if (!canUseSessionStorage()) return

  try {
    window.sessionStorage.setItem(POLICY_DRAFTS_KEY, JSON.stringify(drafts))
  } catch {
    // Ignore storage quota / private-mode errors. Draft persistence is best-effort.
  }
}

export function policyToDraft(policy: AccessPolicy): PolicyDraft {
  return {
    resourceId: policy.resourceId,
    minTier: policy.minTier,
    roles: policy.roles ?? [],
  }
}

export function getPolicyDraftKey(resourceId: string): string {
  return resourceId || '__new__'
}

export function loadPolicyDraft(resourceId: string): PolicyDraft | null {
  const draft = readDrafts()[getPolicyDraftKey(resourceId)]
  if (!draft || typeof draft.resourceId !== 'string' || !Array.isArray(draft.roles)) {
    return null
  }
  return draft
}

export function storePolicyDraft(resourceId: string, draft: PolicyDraft): void {
  const drafts = readDrafts()
  drafts[getPolicyDraftKey(resourceId)] = draft
  writeDrafts(drafts)
}

export function clearPolicyDraft(resourceId: string): void {
  const drafts = readDrafts()
  delete drafts[getPolicyDraftKey(resourceId)]
  writeDrafts(drafts)
}
