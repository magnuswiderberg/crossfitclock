import { uid, type Block, type Interval, type ShareLink, type Workout, type WorkoutSet } from './types'
import { loadSyncState } from './sync'

/**
 * Workout sharing: a share is a public snapshot of a workout under a short
 * code (4 chars, same unambiguous alphabet as sync codes). Creating, listing
 * and deleting shares runs under the sync-account credentials; fetching by
 * code needs nothing, so recipients don't need an account.
 *
 * A snapshot is frozen at push time — it never tracks later edits. Both sides
 * therefore remember the fingerprint of the content they last exchanged
 * (`Workout.shared` for the owner, `Workout.origin` for a recipient), which is
 * what lets the UI say "edited since sharing" or "an update is available"
 * offline and without a shared clock.
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

/**
 * Signature of everything a share carries: name, description and the whole
 * interval structure — but not ids (the recipient regenerates them) and not
 * the local-only fields. Two fingerprints are only ever compared within one
 * role, so the fallbacks `parseSharedWorkout` applies don't matter: an owner
 * compares their workout against what they pushed, a recipient compares a
 * fetched snapshot against what they pulled.
 */
export function shareFingerprint(workout: Workout): string {
  const parts: (string | number)[] = [workout.name.trim(), workout.description?.trim() ?? '']
  for (const block of workout.blocks) {
    parts.push('b', block.label)
    for (const set of block.sets) {
      parts.push('s', set.label, set.rounds, set.restAfterSet)
      for (const iv of set.intervals) parts.push('i', iv.label ?? '', iv.work, iv.rest)
    }
  }
  // Separated, or a label's tail could stand in for the number after it:
  // label "A" with 12 rounds would otherwise read like label "A1" with 2.
  const text = parts.join('\u0001')
  let hash = 0x811c9dc5 // FNV-1a, 32 bits: no collision stakes, just change detection
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

/** True when a shared workout has been edited since its snapshot was pushed. */
export function hasUnsharedEdits(workout: Workout): boolean {
  return workout.shared !== undefined && shareFingerprint(workout) !== workout.shared.fingerprint
}

/** True when an added workout has been edited since it was pulled from its share. */
export function hasLocalEdits(workout: Workout): boolean {
  return workout.origin !== undefined && shareFingerprint(workout) !== workout.origin.fingerprint
}

/**
 * The code to put on screen while this workout runs, or undefined when there
 * is nothing honest to show.
 *
 * Either role can hand a code on — an owner passes out their own, a recipient
 * passes on the one they were given — but only while the content still matches
 * the snapshot behind it. A code that would hand someone a *different* workout
 * than the one on the screen is worse than no code, so drift hides it rather
 * than qualifying it: there is no room on a run screen to explain. Re-sharing
 * (owner) or updating from the share (recipient) brings it back.
 */
export function runShareCode(workout: Workout): string | undefined {
  if (workout.shared && !hasUnsharedEdits(workout)) return workout.shared.code
  if (workout.origin && !hasLocalEdits(workout)) return workout.origin.code
  return undefined
}

/**
 * The workout already added from the same share code, if any. The import
 * screen uses it to offer an update instead of a second copy, and the add
 * itself uses it to know what to replace — one rule, so the two can't disagree.
 */
export function findAddedCopy(workouts: Workout[], added: Workout): Workout | undefined {
  const code = added.origin?.code
  if (!code) return undefined
  return workouts.find((w) => !w.preset && w.origin?.code === code)
}

/**
 * The user's own workout published under this code, if it's on this device.
 * Entering your own code is nothing to import: the workout is already here,
 * and writing the snapshot over it would silently revert anything edited since
 * the share was pushed. Checked before `findAddedCopy`, since owning a code
 * outranks having added it. On a device that doesn't have the workout there is
 * no link to match, so the code imports normally — which is the point of
 * typing your own code somewhere else.
 */
export function findOwnShare(workouts: Workout[], code: string): Workout | undefined {
  return workouts.find((w) => !w.preset && w.shared?.code === code)
}

/** Forget a workout's published code, e.g. after the share was revoked. */
export function forgetShareLink(workout: Workout): Workout {
  const copy = { ...workout }
  delete copy.shared
  return copy
}

/** What goes on the wire: the definition itself, with no local-only state. */
function snapshot(workout: Workout) {
  return {
    id: workout.id, // the server keys a re-share off this, to reuse the code
    name: workout.name,
    ...(workout.description ? { description: workout.description } : {}),
    version: workout.version,
    blocks: workout.blocks,
  }
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

/**
 * Publish a workout and return the link to store on it. Re-sharing keeps the
 * code and refreshes the snapshot, which is how edits reach the share — they
 * never propagate on their own.
 */
export async function createShare(workout: Workout): Promise<ShareLink> {
  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ workout: snapshot(workout) }),
  })
  checkAuthResponse(res)
  const data = (await res.json()) as { code: string }
  return { code: data.code, fingerprint: shareFingerprint(workout) }
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

/** Thrown when a code doesn't resolve, so callers can tell "gone" from "offline". */
export class ShareNotFoundError extends Error {}

/**
 * Look up a share code and return the workout, rebuilt and ready to save. The
 * `origin` link comes back on it, so an added workout remembers where it came
 * from and can be updated from there later.
 */
export async function fetchShare(code: string): Promise<Workout> {
  const normalized = normalizeCode(code)
  if (!normalized) throw new Error('Enter a share code.')
  let res: Response
  try {
    res = await fetch(`/api/share/${normalized}`)
  } catch {
    throw new Error('Could not reach the share server — are you online?')
  }
  if (res.status === 404) {
    throw new ShareNotFoundError(`No shared workout found for code ${normalized}.`)
  }
  if (!res.ok) throw new Error('Could not reach the share server.')
  const data = (await res.json()) as { workout?: unknown }
  const workout = parseSharedWorkout(data.workout)
  return { ...workout, origin: { code: normalized, fingerprint: shareFingerprint(workout) } }
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
