import type { MemberProfile, SocialLink } from '../api/types'
import { isApiError } from '../api/errors'

const DISPLAY_NAME_MAX_LENGTH = 50
const BIO_MAX_LENGTH = 280
const URL_MAX_LENGTH = 2048
const SOCIAL_PLATFORM_MAX_LENGTH = 30
const MAX_SOCIAL_LINKS = 10
const HTTP_URL_PATTERN = /^https?:\/\/.+/i

export type ProfileValidationErrors = Partial<
  Record<'displayName' | 'bio' | 'avatar' | 'socialLinks', string>
>

export class ProfileValidationError extends Error {
  readonly errors: ProfileValidationErrors

  constructor(errors: ProfileValidationErrors) {
    super('Invalid member profile')
    this.name = 'ProfileValidationError'
    this.errors = errors
  }
}

// displayName/bio/avatar are all optional in the API contract, so a blank or
// whitespace-only value means "not customized" rather than a validation error.
function trimmedOrUndefined(value?: string): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= URL_MAX_LENGTH && HTTP_URL_PATTERN.test(trimmed)
}

/** Trims, drops blank entries, and dedupes by platform (case-insensitive). */
export function normalizeSocialLinks(links?: SocialLink[]): SocialLink[] | undefined {
  if (!links?.length) return undefined

  const seen = new Set<string>()
  const normalized: SocialLink[] = []

  for (const link of links) {
    const platform = trimmedOrUndefined(link.platform)
    const url = trimmedOrUndefined(link.url)
    if (!platform || !url) continue

    const key = platform.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    normalized.push({ platform, url })
  }

  return normalized.length > 0 ? normalized : undefined
}

export function validateProfile(
  profile: MemberProfile,
): { valid: true; value: MemberProfile } | { valid: false; errors: ProfileValidationErrors } {
  const errors: ProfileValidationErrors = {}

  const displayName = trimmedOrUndefined(profile.displayName)
  if (displayName && displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    errors.displayName = `Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters.`
  }

  const bio = trimmedOrUndefined(profile.bio)
  if (bio && bio.length > BIO_MAX_LENGTH) {
    errors.bio = `Bio must be at most ${BIO_MAX_LENGTH} characters.`
  }

  const avatar = trimmedOrUndefined(profile.avatar)
  if (avatar && !isHttpUrl(avatar)) {
    errors.avatar = 'Avatar must be a valid http(s) URL.'
  }

  if (profile.socialLinks && profile.socialLinks.length > 0) {
    if (profile.socialLinks.length > MAX_SOCIAL_LINKS) {
      errors.socialLinks = `You can add at most ${MAX_SOCIAL_LINKS} social links.`
    } else {
      const hasInvalidEntry = profile.socialLinks.some((link) => {
        const platform = trimmedOrUndefined(link.platform)
        const url = trimmedOrUndefined(link.url)
        return !platform || platform.length > SOCIAL_PLATFORM_MAX_LENGTH || !url || !isHttpUrl(url)
      })

      if (hasInvalidEntry) {
        errors.socialLinks =
          'Each social link needs a platform name (max 30 characters) and a valid http(s) URL.'
      } else {
        const normalized = normalizeSocialLinks(profile.socialLinks)
        if ((normalized?.length ?? 0) !== profile.socialLinks.length) {
          errors.socialLinks = 'Duplicate platforms are not allowed in social links.'
        }
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors }
  }

  return {
    valid: true,
    value: {
      ...profile,
      displayName,
      bio,
      avatar,
      socialLinks: normalizeSocialLinks(profile.socialLinks),
    },
  }
}

// The live API is called with snake_case field names (see updateProfile in
// lib/api/live.ts), so a real 422 response's `details` bag may key its
// per-field messages either way depending on backend implementation. Accept
// both so we don't silently drop a server-side rejection.
const SERVER_DETAIL_KEY_TO_FIELD: Record<string, keyof ProfileValidationErrors> = {
  displayName: 'displayName',
  display_name: 'displayName',
  bio: 'bio',
  avatar: 'avatar',
  avatar_url: 'avatar',
  avatarUrl: 'avatar',
  socialLinks: 'socialLinks',
  social_links: 'socialLinks',
}

function detailToMessage(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : undefined
  }
  if (Array.isArray(value)) {
    const messages = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    return messages.length > 0 ? messages.join(' ') : undefined
  }
  if (value && typeof value === 'object' && 'message' in value) {
    const message = (value as { message?: unknown }).message
    return typeof message === 'string' && message.trim() ? message.trim() : undefined
  }
  return undefined
}

/**
 * Maps a failed profile update onto the same field-keyed shape used for
 * client-side validation errors, so inline messages render the same way
 * whether the rejection happened before the request left the browser (a
 * `ProfileValidationError`, e.g. from the mock API's own re-validation) or
 * came back from the live backend as a 422 with field-level `details`.
 *
 * Returns `{}` for anything that isn't a field-level validation error
 * (network errors, auth errors, 5xx, etc.) — callers should fall back to a
 * generic error message for those instead of clearing/hiding form errors.
 */
export function mapServerValidationErrors(err: unknown): ProfileValidationErrors {
  if (err instanceof ProfileValidationError) {
    return err.errors
  }

  if (isApiError(err) && err.code === 'validation_error' && err.details) {
    const mapped: ProfileValidationErrors = {}
    for (const [key, value] of Object.entries(err.details)) {
      const field = SERVER_DETAIL_KEY_TO_FIELD[key]
      if (!field) continue
      const message = detailToMessage(value)
      if (message) mapped[field] = message
    }
    return mapped
  }

  return {}
}
