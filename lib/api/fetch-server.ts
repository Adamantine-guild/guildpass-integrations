/**
 * lib/api/fetch-server.ts
 *
 * Server-only fetch helpers for wallet-independent API calls.
 * These are safe to use in React Server Components because they
 * import zero client-only modules (wagmi, React hooks, etc.).
 *
 * Data is fetched directly from the guildpass-core API using
 * the configured base URL, avoiding CORS and extra client→server
 * round trips.
 */

import 'server-only'
import { z } from 'zod'

import { config } from '@/lib/config'
import type { Community, Resource } from './types'
import { CommunitySchema, ResourceSchema } from './types'
import { mapCommunity, mapResource } from './mappers'

// ── Generic fetch wrapper (server-side only) ─────────────────────────────────

class ServerFetchError extends Error {
  readonly status: number
  readonly path: string

  constructor(message: string, status: number, path: string) {
    super(message)
    this.name = 'ServerFetchError'
    this.status = status
    this.path = path
  }
}

async function serverFetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${config.apiUrl}${path}`

  let res: Response
  // Build the fetch init without Next.js extensions, then add `next` separately
  const fetchInit: RequestInit & { next?: { revalidate: number } } = {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    // Allow server-side caching (Next.js fetch cache extension)
    next: { revalidate: 60 },
  }

  try {
    res = await fetch(url, fetchInit)
  } catch (cause) {
    throw new ServerFetchError(
      `Failed to fetch ${url}: ${(cause as Error).message}`,
      0,
      path,
    )
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new ServerFetchError(
      `Server returned ${res.status} for ${path}: ${text.slice(0, 200)}`,
      res.status,
      path,
    )
  }

  if (res.status === 204 || res.status === 205) {
    return {} as T
  }

  return (await res.json()) as T
}

/**
 * Fetch the community profile from the core API.
 * This is a public, wallet-independent endpoint.
 */
export async function fetchCommunity(): Promise<Community> {
  const raw = await serverFetchJson<Record<string, unknown>>('/v1/community')
  const parsed = CommunitySchema.safeParse(raw)
  if (!parsed.success) {
    console.error('[server] Community schema mismatch:', parsed.error.message)
    return raw as unknown as Community
  }
  return mapCommunity(parsed.data)
}

/**
 * Fetch the public resource listing from the core API.
 * This is a public, wallet-independent endpoint.
 */
export async function fetchResources(): Promise<Resource[]> {
  const raw = await serverFetchJson<unknown[]>('/v1/resources')
  const parsed = z.array(ResourceSchema).safeParse(raw)
  if (!parsed.success) {
    console.error('[server] Resources schema mismatch:', parsed.error.message)
    return raw as Resource[]
  }
  return parsed.data.map(mapResource)
}
