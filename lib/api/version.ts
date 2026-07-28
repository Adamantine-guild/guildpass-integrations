import { EXPECTED_API_VERSION } from './types'

/**
 * Result of comparing the frontend's expected API contract version against
 * the backend's advertised version.
 */
export type VersionCompatibility =
  | { compatible: true; expectedVersion: string; backendVersion: string }
  | {
      compatible: false
      expectedVersion: string
      backendVersion: string
      reason: string
    }

interface Semver {
  major: number
  minor: number
  patch: number
}

/**
 * Parse a semver version string. Returns `null` if the string is not a
 * valid semver (e.g. "dev", "latest", or a git SHA).
 */
function parseSemver(v: string): Semver | null {
  const match = v.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  }
}

/**
 * Check whether a backend-reported version is compatible with the frontend's
 * expected API contract version.
 *
 * **Compatibility policy** (semver-style):
 * - Major version must match exactly. A mismatch → incompatible.
 * - Minor and patch differences are tolerated. e.g., frontend expects
 *   `1.2.0`, backend runs `1.3.1` → compatible.
 *
 * This is intentionally strict on major versions to prevent the frontend
 * from silently talking to a backend that has breaking schema changes.
 */
export function checkVersionCompatibility(
  backendVersion: string,
): VersionCompatibility {
  const expected = parseSemver(EXPECTED_API_VERSION)

  if (!expected) {
    return {
      compatible: false,
      expectedVersion: EXPECTED_API_VERSION,
      backendVersion,
      reason: `Frontend EXPECTED_API_VERSION "${EXPECTED_API_VERSION}" is not a valid semver.`,
    }
  }

  const actual = parseSemver(backendVersion)

  if (!actual) {
    return {
      compatible: false,
      expectedVersion: EXPECTED_API_VERSION,
      backendVersion,
      reason: `Backend returned unparseable version "${backendVersion}". Expected semver (e.g. "1.0.0").`,
    }
  }

  if (expected.major !== actual.major) {
    return {
      compatible: false,
      expectedVersion: EXPECTED_API_VERSION,
      backendVersion,
      reason: `Major version mismatch: frontend expects v${expected.major}.x.x, backend reports v${actual.major}.x.x. These versions are incompatible. Please update the frontend or backend to match.`,
    }
  }

  return { compatible: true, expectedVersion: EXPECTED_API_VERSION, backendVersion }
}
