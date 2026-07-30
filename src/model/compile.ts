import { PREP_SECONDS, type Workout } from './types'

export type SegmentType = 'prep' | 'work' | 'rest' | 'setRest'

/**
 * One entry in the flat session timeline. The nested Workout model is for
 * editing and storage; the runner only ever walks this list.
 */
export interface Segment {
  type: SegmentType
  duration: number
  /** Display line: interval label, or "Rest" / "Set rest" etc. */
  label: string
  blockLabel: string
  setLabel: string
  /** 1-based round within the set. */
  round: number
  roundsTotal: number
  /** 0-based interval index within the round. */
  intervalIndex: number
  intervalsTotal: number
}

const REST_LABELS: Record<Exclude<SegmentType, 'work' | 'prep'>, string> = {
  rest: 'Rest',
  setRest: 'Set rest',
}

export function compile(workout: Workout): Segment[] {
  const segments: Segment[] = []

  for (const block of workout.blocks) {
    for (const set of block.sets) {
      const base = {
        blockLabel: block.label,
        setLabel: set.label,
        roundsTotal: set.rounds,
        intervalsTotal: set.intervals.length,
      }
      for (let round = 1; round <= set.rounds; round++) {
        set.intervals.forEach((interval, i) => {
          if (interval.work > 0) {
            segments.push({
              ...base,
              type: 'work',
              duration: interval.work,
              label: interval.label?.trim() || 'Work',
              round,
              intervalIndex: i,
            })
          }
          if (interval.rest > 0) {
            segments.push({
              ...base,
              type: 'rest',
              duration: interval.rest,
              label: REST_LABELS.rest,
              round,
              intervalIndex: i,
            })
          }
        })
      }
      if (set.restAfterSet > 0) {
        segments.push({
          ...base,
          type: 'setRest',
          duration: set.restAfterSet,
          label: REST_LABELS.setRest,
          round: set.rounds,
          intervalIndex: set.intervals.length - 1,
        })
      }
    }
  }

  // A session should end on effort, not on a rest countdown.
  while (segments.length > 0 && segments[segments.length - 1].type !== 'work') {
    segments.pop()
  }

  if (segments.length > 0) {
    const first = segments[0]
    segments.unshift({
      ...first,
      type: 'prep',
      duration: PREP_SECONDS,
      label: 'Get ready',
    })
  }

  return segments
}

export function totalDuration(workout: Workout): number {
  return compile(workout).reduce((sum, s) => sum + s.duration, 0)
}

export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
