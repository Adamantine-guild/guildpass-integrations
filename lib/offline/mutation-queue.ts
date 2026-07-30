/**
 * lib/offline/mutation-queue.ts
 *
 * Durable FIFO queue for admin write mutations (assignRole / removeRole /
 * updatePolicy) attempted while offline. Backed by IndexedDB so it survives
 * a full page reload — sessionStorage/localStorage are unsuitable here since
 * they're synchronous and size-limited, and this data needs to persist
 * exactly like the mutations it represents.
 *
 * Storage access is behind the small {@link QueueStorage} interface so it
 * can be swapped out. This repo's test suite runs under plain Node
 * (`node --test`, no jsdom/IndexedDB — see package.json's "test" script),
 * so tests construct a queue via {@link createMutationQueue} over an
 * in-memory {@link createInMemoryQueueStorage} backing store instead of the
 * real IndexedDB-backed one the app uses. The same in-memory storage doubles
 * as a graceful runtime fallback if `indexedDB` is unavailable (e.g. private
 * browsing in some browsers), matching this codebase's existing "best effort,
 * never throw" storage conventions (see lib/policy-drafts.ts).
 */

import type { AccessPolicy, Role } from '../api/types'

export type QueuedMutationType = 'assignRole' | 'removeRole' | 'updatePolicy'

export interface AssignRolePayload {
  address: string
  role: Role
}

export interface RemoveRolePayload {
  address: string
  role: Role
}

export interface UpdatePolicyPayload {
  /**
   * The full policy the admin attempted to save, including `updatedAt` (if
   * any) — that field IS this app's optimistic-concurrency version token
   * (see docs/POLICY_CONCURRENCY.md), so persisting the whole policy is
   * sufficient for replay to correctly detect a 409 conflict later; no
   * separate ETag/version field is needed.
   */
  policy: AccessPolicy
}

type QueuedMutationVariant =
  | { type: 'assignRole'; payload: AssignRolePayload }
  | { type: 'removeRole'; payload: RemoveRolePayload }
  | { type: 'updatePolicy'; payload: UpdatePolicyPayload }

export type QueuedMutation = QueuedMutationVariant & {
  id: string
  /** ISO timestamp when the mutation was queued — the primary FIFO sort key. */
  queuedAt: string
  /**
   * Monotonically increasing (within this process's lifetime) tiebreaker for
   * mutations enqueued within the same millisecond, where `queuedAt` alone
   * can't distinguish order. Resets to 0 on reload, which is safe because a
   * reload takes long enough in wall-clock time that `queuedAt` alone
   * disambiguates anything queued before vs. after it.
   */
  sequence: number
  /** Number of failed replay attempts so far. */
  retryCount: number
  /** Community the mutation targets, captured at enqueue time so replay
   *  doesn't depend on whatever route happens to be active later. */
  communitySlug: string
}

export type PayloadFor<T extends QueuedMutationType> = Extract<
  QueuedMutationVariant,
  { type: T }
>['payload']

export interface QueueStorage {
  getAll(): Promise<QueuedMutation[]>
  put(mutation: QueuedMutation): Promise<void>
  delete(id: string): Promise<void>
}

// ── In-memory storage (test double + no-IndexedDB fallback) ────────────────

export function createInMemoryQueueStorage(
  backing: Map<string, QueuedMutation> = new Map(),
): QueueStorage {
  return {
    async getAll() {
      return Array.from(backing.values())
    },
    async put(mutation) {
      backing.set(mutation.id, mutation)
    },
    async delete(id) {
      backing.delete(id)
    },
  }
}

// ── IndexedDB storage (real, browser-persisted backend) ─────────────────────

const DB_NAME = 'guildpass-offline-mutations'
const DB_VERSION = 1
const STORE_NAME = 'mutations'

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function createIndexedDbQueueStorage(): QueueStorage {
  let dbPromise: Promise<IDBDatabase> | null = null
  const getDb = () => {
    if (!dbPromise) dbPromise = openDb()
    return dbPromise
  }

  return {
    async getAll() {
      const db = await getDb()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const request = tx.objectStore(STORE_NAME).getAll()
        request.onsuccess = () => resolve(request.result as QueuedMutation[])
        request.onerror = () => reject(request.error)
      })
    },
    async put(mutation) {
      const db = await getDb()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).put(mutation)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    },
    async delete(id) {
      const db = await getDb()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).delete(id)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    },
  }
}

function defaultStorage(): QueueStorage {
  return hasIndexedDb() ? createIndexedDbQueueStorage() : createInMemoryQueueStorage()
}

// ── Queue ─────────────────────────────────────────────────────────────────────

function generateId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function byQueuedAtAscending(a: QueuedMutation, b: QueuedMutation): number {
  if (a.queuedAt !== b.queuedAt) return a.queuedAt < b.queuedAt ? -1 : 1
  // Same-millisecond tiebreak — `id` is a random UUID (not sortable by
  // insertion order), so a monotonic sequence number is required here.
  return a.sequence - b.sequence
}

export interface MutationQueue {
  /** Persist a new mutation at the tail of the queue. */
  enqueue<T extends QueuedMutationType>(
    type: T,
    payload: PayloadFor<T>,
    communitySlug: string,
  ): Promise<QueuedMutation>
  /** All queued mutations, oldest first (FIFO). */
  list(): Promise<QueuedMutation[]>
  /** The oldest queued mutation, or null if the queue is empty. */
  peek(): Promise<QueuedMutation | null>
  remove(id: string): Promise<void>
  incrementRetryCount(id: string): Promise<QueuedMutation | null>
  count(): Promise<number>
  /** Subscribe to any enqueue/remove/retry change. Returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void
}

export function createMutationQueue(storage: QueueStorage = defaultStorage()): MutationQueue {
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())
  let sequenceCounter = 0

  const list = async (): Promise<QueuedMutation[]> => {
    const all = await storage.getAll()
    return all.slice().sort(byQueuedAtAscending)
  }

  return {
    async enqueue(type, payload, communitySlug) {
      const mutation = {
        id: generateId(),
        type,
        payload,
        queuedAt: new Date().toISOString(),
        sequence: sequenceCounter++,
        retryCount: 0,
        communitySlug,
      } as QueuedMutation
      await storage.put(mutation)
      notify()
      return mutation
    },

    list,

    async peek() {
      const all = await list()
      return all[0] ?? null
    },

    async remove(id) {
      await storage.delete(id)
      notify()
    },

    async incrementRetryCount(id) {
      const all = await storage.getAll()
      const existing = all.find((m) => m.id === id)
      if (!existing) return null
      const updated: QueuedMutation = { ...existing, retryCount: existing.retryCount + 1 }
      await storage.put(updated)
      notify()
      return updated
    },

    async count() {
      const all = await storage.getAll()
      return all.length
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** The app-wide singleton queue, backed by IndexedDB (or the in-memory
 *  fallback if IndexedDB isn't available in this browser). */
export const mutationQueue: MutationQueue = createMutationQueue()
