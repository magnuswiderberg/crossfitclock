/** One timed exercise: work seconds, then optional rest seconds. */
export interface Interval {
  id: string
  /** Optional exercise name, e.g. "Burpees". */
  label?: string
  work: number
  rest: number
}

/** A repeated group of intervals, e.g. "8 rounds of 20/10". */
export interface WorkoutSet {
  id: string
  label: string
  rounds: number
  intervals: Interval[]
  /**
   * Rest after the whole set completes. Rest between rounds is expressed via
   * the last interval's own rest, which fires at the end of every round.
   */
  restAfterSet: number
}

/** A named section of the workout, e.g. Warm-up / Main / Stretch. */
export interface Block {
  id: string
  label: string
  sets: WorkoutSet[]
}

/** The saved, named definition. Running one creates a session. */
export interface Workout {
  id: string
  name: string
  version: 1
  blocks: Block[]
}

/** Countdown before the very first interval of a session. */
export const PREP_SECONDS = 5
/** Beeps sound this many seconds before each work interval starts. */
export const COUNTDOWN_SECONDS = 2

export function uid(): string {
  return crypto.randomUUID()
}
