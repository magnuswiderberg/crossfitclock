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

/**
 * A workout's tie to a share code. `fingerprint` is the content signature
 * (`shareFingerprint` in `model/share.ts`) at the moment the snapshot was
 * pushed or pulled, so drift is detected by comparing content rather than
 * trusting either side's clock.
 */
export interface ShareLink {
  code: string
  fingerprint: string
}

/** The saved, named definition. Running one creates a session. */
export interface Workout {
  id: string
  name: string
  /**
   * Optional intention/background shown on the detail screen — also the place
   * for prescribed movements the interval structure can't express (e.g. the
   * rep scheme inside an AMRAP interval).
   */
  description?: string
  version: 1
  blocks: Block[]
  /** Built-in workouts are read-only: no edit, no delete. Copy to customize. */
  preset?: boolean
  /** Epoch ms of the last save; drives last-write-wins sync. Never on presets. */
  updatedAt?: number
  /** The share code this workout is published under, set when it was shared. */
  shared?: ShareLink
  /** The share code this workout was added from, so it can be updated later. */
  origin?: ShareLink
}

/** Countdown before the very first interval of a session. */
export const PREP_SECONDS = 5
/** Beeps sound this many seconds before each work interval starts. */
export const COUNTDOWN_SECONDS = 2

export function uid(): string {
  return crypto.randomUUID()
}
