import { buildPresets } from './presets'
import { uid, type Workout } from './types'

const KEY = 'crossfitclock.workouts.v1'
const SESSION_KEY = 'crossfitclock.session.v1'

/**
 * The in-flight session, persisted so a page reload (or PWA restart) drops
 * the user back into the running clock. The workout is snapshotted whole so
 * later edits or deletes can't corrupt an active session.
 */
export interface ActiveSession {
  workout: Workout
  /** Epoch ms when segment 0 started (shifted forward for time spent paused). */
  startedAt: number
  /** Epoch ms when the session was paused, or null if it was running. */
  pausedAt: number | null
}

export function loadActiveSession(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as ActiveSession
    if (typeof s?.startedAt === 'number' && Array.isArray(s.workout?.blocks)) return s
  } catch {
    // Corrupt record — drop it below.
  }
  clearActiveSession()
  return null
}

export function saveActiveSession(session: ActiveSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearActiveSession(): void {
  localStorage.removeItem(SESSION_KEY)
}

export function loadWorkouts(): Workout[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Workout[]
      if (Array.isArray(parsed) && parsed.length > 0) return syncPresets(markLegacyPresets(parsed))
    }
  } catch {
    // Corrupt storage falls through to a fresh seed.
  }
  const presets = buildPresets()
  saveWorkouts(presets)
  return presets
}

/**
 * Storage seeded before the `preset` flag existed holds unflagged presets.
 * Re-flag them by name (copies are safe — they get a "(copy)" suffix).
 */
function markLegacyPresets(workouts: Workout[]): Workout[] {
  const presetNames = new Set(buildPresets().map((p) => p.name))
  for (const w of workouts) {
    if (w.preset === undefined && presetNames.has(w.name)) w.preset = true
  }
  return workouts
}

/**
 * Presets are read-only, so stored copies can be swapped for the current
 * definitions: removed ones disappear, new ones appear, and content tweaks
 * propagate. Unchanged presets keep their stored entry (stable ids, no
 * rewrite); user workouts pass through untouched.
 */
function syncPresets(workouts: Workout[]): Workout[] {
  const strip = (w: Workout) => JSON.stringify(w, (key, value) => (key === 'id' ? undefined : value))
  const storedByName = new Map(workouts.filter((w) => w.preset).map((w) => [w.name, w]))
  const presets = buildPresets().map((p) => {
    const stored = storedByName.get(p.name)
    return stored && strip(stored) === strip(p) ? stored : p
  })
  const synced = [...presets, ...workouts.filter((w) => !w.preset)]
  if (synced.length !== workouts.length || synced.some((w, i) => w !== workouts[i])) {
    saveWorkouts(synced)
  }
  return synced
}

export function saveWorkouts(workouts: Workout[]): void {
  localStorage.setItem(KEY, JSON.stringify(workouts))
}

export function duplicateWorkout(workout: Workout): Workout {
  const copy: Workout = JSON.parse(JSON.stringify(workout))
  copy.id = uid()
  copy.name = `${workout.name} (copy)`
  delete copy.preset
  for (const block of copy.blocks) {
    block.id = uid()
    for (const set of block.sets) {
      set.id = uid()
      for (const iv of set.intervals) iv.id = uid()
    }
  }
  return copy
}

export function emptyWorkout(): Workout {
  return {
    id: uid(),
    name: 'New workout',
    version: 1,
    blocks: [
      {
        id: uid(),
        label: 'Main',
        sets: [
          {
            id: uid(),
            label: 'Set 1',
            rounds: 8,
            intervals: [{ id: uid(), work: 20, rest: 10 }],
            restAfterSet: 0,
          },
        ],
      },
    ],
  }
}
