import type { Workout } from './types'

const SYNC_KEY = 'crossfitclock.sync.v1'

/**
 * Device-side sync state. The secret is the "sync code" shown once at claim
 * time; tombstones record local deletions until the server has seen them, so
 * a delete here doesn't resurrect from another device.
 */
export interface SyncState {
  handle: string
  secret: string
  /** Workout id → epoch ms when it was deleted locally. */
  tombstones: Record<string, number>
  lastSyncAt?: number
}

export function loadSyncState(): SyncState | null {
  try {
    const raw = localStorage.getItem(SYNC_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as SyncState
    if (typeof s?.handle === 'string' && typeof s?.secret === 'string') {
      s.tombstones ??= {}
      return s
    }
  } catch {
    // Corrupt record — treat as not connected.
  }
  return null
}

function saveSyncState(state: SyncState): void {
  localStorage.setItem(SYNC_KEY, JSON.stringify(state))
}

export function isConnected(): boolean {
  return loadSyncState() !== null
}

/** Forget this device's credentials. Local and remote workouts are untouched. */
export function disconnect(): void {
  localStorage.removeItem(SYNC_KEY)
}

/** Remember a local deletion so the next sync propagates it. */
export function recordDeletion(workoutId: string): void {
  const state = loadSyncState()
  if (!state) return
  state.tombstones[workoutId] = Date.now()
  saveSyncState(state)
}

async function post(path: string, body: unknown, state?: Pick<SyncState, 'handle' | 'secret'>) {
  return fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(state ? { 'x-cfc-handle': state.handle, 'x-cfc-secret': state.secret } : {}),
    },
    body: JSON.stringify(body),
  })
}

/** Claim a new handle; the server generates the sync code. */
export async function claimHandle(handle: string): Promise<{ handle: string; secret: string }> {
  const res = await post('/api/account/claim', { handle: handle.trim().toLowerCase() })
  if (res.status === 409) throw new Error('That handle is already taken.')
  if (res.status === 400) throw new Error('Handles are 3–20 characters: letters, digits, dashes.')
  if (!res.ok) throw new Error('Could not reach the sync server.')
  const account = (await res.json()) as { handle: string; secret: string }
  saveSyncState({ ...account, tombstones: {} })
  return account
}

/** Connect this device to an existing handle using its sync code. */
export async function connect(handle: string, secret: string): Promise<void> {
  const creds = { handle: handle.trim().toLowerCase(), secret: secret.trim().toUpperCase() }
  const res = await post('/api/account/login', {}, creds)
  if (res.status === 401) throw new Error('Handle and sync code don’t match.')
  if (!res.ok) throw new Error('Could not reach the sync server.')
  saveSyncState({ ...creds, tombstones: {} })
}

interface SyncedItem {
  id: string
  updatedAt: number
  deleted?: boolean
  workout?: Workout | null
}

/**
 * Push local user workouts + tombstones, pull the merged set (last-write-wins
 * per workout on the server). Returns the full new workout list with presets
 * passed through untouched, or null when no account is configured.
 */
export async function syncNow(all: Workout[]): Promise<Workout[] | null> {
  const state = loadSyncState()
  if (!state) return null

  const items: SyncedItem[] = [
    ...all
      .filter((w) => !w.preset)
      .map((w) => ({ id: w.id, updatedAt: w.updatedAt ?? 0, workout: w })),
    ...Object.entries(state.tombstones).map(([id, deletedAt]) => ({
      id,
      updatedAt: deletedAt,
      deleted: true,
    })),
  ]

  const res = await post('/api/sync', { workouts: items }, state)
  if (!res.ok) throw new Error(`Sync failed (${res.status}).`)
  const data = (await res.json()) as { workouts: SyncedItem[] }

  const merged = data.workouts
    .filter((d) => !d.deleted && d.workout)
    .map((d) => ({ ...(d.workout as Workout), updatedAt: d.updatedAt }))

  // The server has now seen every tombstone we sent (they're in its store),
  // so local ones are done. Re-read state: a claim/disconnect can't have
  // happened mid-flight, but deletions during the request could — keep those.
  const fresh = loadSyncState()
  if (fresh) {
    for (const id of Object.keys(state.tombstones)) delete fresh.tombstones[id]
    fresh.lastSyncAt = Date.now()
    saveSyncState(fresh)
  }

  return [...all.filter((w) => w.preset), ...merged]
}
