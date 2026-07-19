import type {
  Community,
  Resource,
  AccessPolicy,
  WebhookEventLog,
  Membership,
  Role,
  MemberProfile,
} from './types'

export interface PersistedMockState {
  community: Community
  resources: Resource[]
  policies: AccessPolicy[]
  webhookEvents: WebhookEventLog[]
  memberStore: Record<string, { membership: Membership; roles: Role[]; profile: MemberProfile }>
}

const DB_NAME = 'guildpass-mock'
const STORE_NAME = 'state'
export const LS_KEY = 'guildpass-mock-state'

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isBrowser()) return reject(new Error('Not in browser'))
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function getFromStore(db: IDBDatabase, key: IDBValidKey): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}

function putInStore(db: IDBDatabase, key: IDBValidKey, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).put(value, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

function clearStore(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function loadPersistedState(): Promise<PersistedMockState | null> {
  if (!isBrowser()) return null

  try {
    const db = await openDB()
    const result = await getFromStore(db, 'state')
    return result as PersistedMockState | null
  } catch {
    try {
      const raw = localStorage.getItem(LS_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }
}

export async function persistState(state: PersistedMockState): Promise<void> {
  if (!isBrowser()) return

  try {
    const db = await openDB()
    await putInStore(db, 'state', state)
  } catch {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state))
    } catch {
      /* quota exceeded or storage unavailable — skip */
    }
  }
}

export async function clearPersistedState(): Promise<void> {
  if (!isBrowser()) return

  try {
    const db = await openDB()
    await clearStore(db)
  } catch {
    /* ignore */
  }

  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}
