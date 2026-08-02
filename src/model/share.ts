import { uid, type Block, type Interval, type Workout, type WorkoutSet } from './types'
import { loadSyncState } from './sync'

/**
 * Workout sharing: a share is a public snapshot of a workout under a short
 * code (4 chars, same unambiguous alphabet as sync codes). Creating, listing
 * and deleting shares runs under the sync-account credentials; fetching by
 * code needs nothing, so recipients don't need an account.
 */

export interface ShareInfo {
  code: string
  name: string
  createdAt: number
  updatedAt: number
}

/** Uppercase and drop anything that can't be part of a code (spaces, dashes). */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function authHeaders(): Record<string, string> {
  const state = loadSyncState()
  if (!state) throw new Error('Sharing needs a sync handle — connect on the Sync screen first.')
  return { 'x-cfc-handle': state.handle, 'x-cfc-secret': state.secret }
}

function checkAuthResponse(res: Response): void {
  if (res.status === 401) {
    throw new Error('Sync sign-in failed — reconnect on the Sync screen.')
  }
  if (!res.ok) throw new Error('Could not reach the share server.')
}

/** Share a workout; returns its code. Re-sharing keeps the code, refreshes the snapshot. */
export async function createShare(workout: Workout): Promise<string> {
  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ workout }),
  })
  checkAuthResponse(res)
  const data = (await res.json()) as { code: string }
  return data.code
}

export async function listShares(): Promise<ShareInfo[]> {
  const res = await fetch('/api/share', { headers: authHeaders() })
  checkAuthResponse(res)
  const data = (await res.json()) as { shares: ShareInfo[] }
  return data.shares
}

export async function deleteShare(code: string): Promise<void> {
  const res = await fetch(`/api/share/${normalizeCode(code)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (res.status === 404) return // already gone — the goal state
  checkAuthResponse(res)
}

/** Look up a share code and return the workout, rebuilt and ready to save. */
export async function fetchShare(code: string): Promise<Workout> {
  const normalized = normalizeCode(code)
  if (!normalized) throw new Error('Enter a share code.')
  let res: Response
  try {
    res = await fetch(`/api/share/${normalized}`)
  } catch {
    throw new Error('Could not reach the share server — are you online?')
  }
  if (res.status === 404) throw new Error(`No shared workout found for code ${normalized}.`)
  if (!res.ok) throw new Error('Could not reach the share server.')
  const data = (await res.json()) as { workout?: unknown }
  return parseSharedWorkout(data.workout)
}

// ---- parsing ----------------------------------------------------------------
// The snapshot comes from someone else's device via a public code, so nothing
// in it is trusted: the workout is rebuilt field by field with fresh ids, and
// anything structurally off aborts the import.

const invalid = () => new Error('That shared workout looks broken and can’t be imported.')

function asLabel(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim().slice(0, 100) : ''
  return text || fallback
}

/** Whole seconds clamped to [0, 10h] — enough for any real interval. */
function asSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw invalid()
  return Math.min(Math.floor(value), 36_000)
}

/** Round count clamped to [1, 500]. */
function asRounds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid()
  return Math.min(Math.max(1, Math.floor(value)), 500)
}

function parseInterval(raw: unknown): Interval {
  if (typeof raw !== 'object' || raw === null) throw invalid()
  const iv = raw as Record<string, unknown>
  const label = typeof iv.label === 'string' ? iv.label.trim().slice(0, 100) : ''
  return {
    id: uid(),
    ...(label ? { label } : {}),
    work: asSeconds(iv.work),
    rest: asSeconds(iv.rest),
  }
}

function parseSet(raw: unknown, index: number): WorkoutSet {
  if (typeof raw !== 'object' || raw === null) throw invalid()
  const set = raw as Record<string, unknown>
  if (!Array.isArray(set.intervals) || set.intervals.length === 0) throw invalid()
  return {
    id: uid(),
    label: asLabel(set.label, `Set ${index + 1}`),
    rounds: asRounds(set.rounds),
    intervals: set.intervals.slice(0, 50).map(parseInterval),
    restAfterSet: asSeconds(set.restAfterSet),
  }
}

function parseBlock(raw: unknown, index: number): Block {
  if (typeof raw !== 'object' || raw === null) throw invalid()
  const block = raw as Record<string, unknown>
  if (!Array.isArray(block.sets) || block.sets.length === 0) throw invalid()
  return {
    id: uid(),
    label: asLabel(block.label, `Block ${index + 1}`),
    sets: block.sets.slice(0, 50).map(parseSet),
  }
}

/** Rebuild a received snapshot as a brand-new local workout (never a preset). */
export function parseSharedWorkout(raw: unknown): Workout {
  if (typeof raw !== 'object' || raw === null) throw invalid()
  const w = raw as Record<string, unknown>
  if (!Array.isArray(w.blocks) || w.blocks.length === 0) throw invalid()
  const description =
    typeof w.description === 'string' ? w.description.trim().slice(0, 2000) : ''
  return {
    id: uid(),
    name: asLabel(w.name, 'Shared workout'),
    ...(description ? { description } : {}),
    version: 1,
    blocks: w.blocks.slice(0, 20).map(parseBlock),
  }
}
