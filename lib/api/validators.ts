/**
 * lib/api/validators.ts
 *
 * Lightweight runtime validation for backend responses.
 */

import { ApiError } from './errors'

function throwValidationError(message: string, path?: string): never {
  throw new ApiError({
    status: 422,
    code: 'validation_error',
    safeMessage: message,
    path,
  })
}

export function validateSessionResponse(raw: any, path?: string): void {
  if (!raw || typeof raw !== 'object') {
    throwValidationError('Invalid session response', path)
  }
}

export function validateCommunityResponse(raw: any, path?: string): void {
  if (!raw || typeof raw !== 'object' || !raw.id) {
    throwValidationError('Invalid community response', path)
  }
}

export function validateMembershipResponse(raw: any, path?: string): void {
  if (raw !== null && typeof raw !== 'object') {
    throwValidationError('Invalid membership response', path)
  }
}

export function validateMemberProfileResponse(raw: any, path?: string): void {
  if (raw !== null && typeof raw !== 'object') {
    throwValidationError('Invalid member profile response', path)
  }
}

export function validateMemberRowsResponse(raw: any, path?: string): void {
  if (!Array.isArray(raw)) {
    throwValidationError('Invalid members list response', path)
  }
}

export function validateResourcesResponse(raw: any, path?: string): void {
  if (!Array.isArray(raw)) {
    throwValidationError('Invalid resources list response', path)
  }
}

export function validatePoliciesResponse(raw: any, path?: string): void {
  if (!Array.isArray(raw)) {
    throwValidationError('Invalid policies list response', path)
  }
}

export function validateResourceResponse(raw: any, path?: string): void {
  if (!raw || typeof raw !== 'object' || !raw.id) {
    throwValidationError('Invalid resource response', path)
  }
}

export function validatePolicyResponse(raw: any, path?: string): void {
  if (!raw || typeof raw !== 'object' || (!raw.resourceId && !raw.resource_id)) {
    throwValidationError('Invalid policy response', path)
  }
}

export function validateWebhookEventsResponse(raw: any, path?: string): void {
  if (!Array.isArray(raw)) {
    throwValidationError('Invalid webhook events response', path)
  }
}
