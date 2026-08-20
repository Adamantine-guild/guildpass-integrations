/**
 * lib/api/mock/social.ts
 *
 * Social-graph domain of the mock API: connection requests, privacy
 * settings, and blocking. Extracted from lib/api/mock.ts.
 */
import {
  mockConnections,
  mockPrivacySettings,
  setMockConnections,
} from './fixtures'
import { initPromise, type MockApiContext } from './state'
import type { Connection, MemberPrivacySettings } from '../types'

export async function mockGetConnections(
  ctx: MockApiContext,
  address: string,
  _signal?: AbortSignal,
): Promise<Connection[]> {
  await initPromise
  const addr = address.toLowerCase()
  const viewer = ctx.address?.toLowerCase()

  // 1. Block check: active block in either direction -> empty/hidden profile
  const isBlocked = mockConnections.some(c =>
    c.status === 'blocked' &&
    ((c.fromAddress.toLowerCase() === viewer && c.toAddress.toLowerCase() === addr) ||
     (c.toAddress.toLowerCase() === viewer && c.fromAddress.toLowerCase() === addr))
  )
  if (isBlocked) {
    return []
  }

  // 2. Privacy rules check
  const targetPrivacy = mockPrivacySettings[addr]?.connectionVisibility || 'public'
  const isOwner = viewer === addr
  if (!isOwner) {
    if (targetPrivacy === 'private') {
      return []
    }
    if (targetPrivacy === 'mutual-only') {
      const hasMutual = mockConnections.some(c =>
        c.status === 'accepted' &&
        ((c.fromAddress.toLowerCase() === viewer && c.toAddress.toLowerCase() === addr) ||
         (c.toAddress.toLowerCase() === viewer && c.fromAddress.toLowerCase() === addr))
      )
      if (!hasMutual) return []
    }
  }

  // Return non-blocked connections for this address
  return mockConnections.filter(c =>
    c.status !== 'blocked' &&
    (c.fromAddress.toLowerCase() === addr || c.toAddress.toLowerCase() === addr)
  )
}

export async function mockGetPrivacySettings(
  ctx: MockApiContext,
  address: string,
  _signal?: AbortSignal,
): Promise<MemberPrivacySettings> {
  await initPromise
  const addr = address.toLowerCase()
  return mockPrivacySettings[addr] || { address, connectionVisibility: 'public' }
}

export async function mockUpdatePrivacySettings(
  ctx: MockApiContext,
  address: string,
  settings: MemberPrivacySettings,
): Promise<void> {
  await initPromise
  const addr = address.toLowerCase()
  mockPrivacySettings[addr] = settings
}

export async function mockBlockMember(ctx: MockApiContext, targetAddress: string): Promise<void> {
  await initPromise
  if (!ctx.address) throw new Error('Not logged in')
  const viewer = ctx.address.toLowerCase()
  const target = targetAddress.toLowerCase()

  // Remove existing connections between them
  setMockConnections(mockConnections.filter(c =>
    !((c.fromAddress.toLowerCase() === viewer && c.toAddress.toLowerCase() === target) ||
      (c.toAddress.toLowerCase() === viewer && c.fromAddress.toLowerCase() === target))
  ))

  // Add block record
  mockConnections.push({
    id: `block-${Date.now()}`,
    fromAddress: ctx.address,
    toAddress: targetAddress,
    status: 'blocked',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
}

export async function mockUnblockMember(ctx: MockApiContext, targetAddress: string): Promise<void> {
  await initPromise
  if (!ctx.address) throw new Error('Not logged in')
  const viewer = ctx.address.toLowerCase()
  const target = targetAddress.toLowerCase()

  setMockConnections(mockConnections.filter(c =>
    !(c.status === 'blocked' && c.fromAddress.toLowerCase() === viewer && c.toAddress.toLowerCase() === target)
  ))
}

export async function mockCreateConnectionRequest(ctx: MockApiContext, targetAddress: string): Promise<void> {
  await initPromise
  if (!ctx.address) throw new Error('Not logged in')
  mockConnections.push({
    id: `conn-${Date.now()}`,
    fromAddress: ctx.address,
    toAddress: targetAddress,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
}

export async function mockAcceptConnectionRequest(ctx: MockApiContext, targetAddress: string): Promise<void> {
  await initPromise
  if (!ctx.address) throw new Error('Not logged in')
  const viewer = ctx.address.toLowerCase()
  const target = targetAddress.toLowerCase()

  const conn = mockConnections.find(c =>
    c.status === 'pending' &&
    c.fromAddress.toLowerCase() === target &&
    c.toAddress.toLowerCase() === viewer
  )
  if (conn) {
    conn.status = 'accepted'
    conn.updatedAt = new Date().toISOString()
  }
}

export async function mockRejectConnectionRequest(ctx: MockApiContext, targetAddress: string): Promise<void> {
  await initPromise
  if (!ctx.address) throw new Error('Not logged in')
  const viewer = ctx.address.toLowerCase()
  const target = targetAddress.toLowerCase()

  setMockConnections(mockConnections.filter(c =>
    !(c.status === 'pending' &&
      c.fromAddress.toLowerCase() === target &&
      c.toAddress.toLowerCase() === viewer)
  ))
}