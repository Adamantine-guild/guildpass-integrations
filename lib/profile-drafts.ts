import type { SocialLink } from './api/types'

const PROFILE_DRAFTS_KEY = 'guildpass:profile-drafts'

export type ProfileDraft = {
  displayName?: string
  bio?: string
  avatar?: string
  socialLinks?: SocialLink[]
}

type ProfileDraftStore = Record<string, ProfileDraft>

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

function readDrafts(): ProfileDraftStore {
  if (!canUseSessionStorage()) return {}

  try {
    const raw = window.sessionStorage.getItem(PROFILE_DRAFTS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as ProfileDraftStore
  } catch {
    return {}
  }
}

function writeDrafts(drafts: ProfileDraftStore): void {
  if (!canUseSessionStorage()) return

  try {
    window.sessionStorage.setItem(PROFILE_DRAFTS_KEY, JSON.stringify(drafts))
  } catch {
    // Ignore storage quota / private-mode errors. Draft persistence is best-effort.
  }
}

export function loadProfileDraft(address: string): ProfileDraft | null {
  return readDrafts()[address.toLowerCase()] ?? null
}

export function storeProfileDraft(address: string, draft: ProfileDraft): void {
  const drafts = readDrafts()
  drafts[address.toLowerCase()] = draft
  writeDrafts(drafts)
}

export function clearProfileDraft(address: string): void {
  const drafts = readDrafts()
  delete drafts[address.toLowerCase()]
  writeDrafts(drafts)
}
