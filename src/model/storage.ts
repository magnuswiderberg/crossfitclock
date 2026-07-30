import { buildPresets } from './presets'
import { uid, type Workout } from './types'

const KEY = 'crossfitclock.workouts.v1'

export function loadWorkouts(): Workout[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Workout[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    // Corrupt storage falls through to a fresh seed.
  }
  const presets = buildPresets()
  saveWorkouts(presets)
  return presets
}

export function saveWorkouts(workouts: Workout[]): void {
  localStorage.setItem(KEY, JSON.stringify(workouts))
}

export function duplicateWorkout(workout: Workout): Workout {
  const copy: Workout = JSON.parse(JSON.stringify(workout))
  copy.id = uid()
  copy.name = `${workout.name} (copy)`
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
            restBetweenRounds: 0,
            restAfterSet: 0,
          },
        ],
      },
    ],
  }
}
