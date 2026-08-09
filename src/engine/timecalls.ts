/**
 * Spoken time calls inside a work interval — the coach's voice, for people who
 * can't see the screen.
 *
 * Two ladders, both on work segments only (a rest already says everything it
 * needs to with the pitch-coded ticks):
 *
 *   count-up   elapsed milestones — "thirty", "one minute", "one thirty" …
 *              so ten people holding one shared plank can each hear their own
 *              goal go by and drop out on it.
 *   countdown  "TEN" and "FIVE" remaining, then the existing ticks at −2, −1.
 *              Knowing the end is close is what gets people to hold on.
 *
 * The two vocabularies are deliberately disjoint — no word is ever spoken in
 * both directions — so "thirty" always means time served and "ten" always means
 * time left, with no arithmetic mid-effort.
 *
 * Every word ships as a bundled clip (see scripts/build-audio.ps1, which must
 * stay in step with WORDS below), so calls need no backend, work offline, and
 * ride the same audio route as the beeps.
 */
import type { Segment } from '../model/compile'
import fiveMinutesUrl from '../audio/five-minutes.mp3'
import fiveUrl from '../audio/five.mp3'
import fourMinutesUrl from '../audio/four-minutes.mp3'
import fourThirtyUrl from '../audio/four-thirty.mp3'
import eightMinutesUrl from '../audio/eight-minutes.mp3'
import nineMinutesUrl from '../audio/nine-minutes.mp3'
import oneMinuteUrl from '../audio/one-minute.mp3'
import oneThirtyUrl from '../audio/one-thirty.mp3'
import sevenMinutesUrl from '../audio/seven-minutes.mp3'
import sixMinutesUrl from '../audio/six-minutes.mp3'
import tenMinutesUrl from '../audio/ten-minutes.mp3'
import tenUrl from '../audio/ten.mp3'
import thirtyUrl from '../audio/thirty.mp3'
import threeMinutesUrl from '../audio/three-minutes.mp3'
import threeThirtyUrl from '../audio/three-thirty.mp3'
import twoMinutesUrl from '../audio/two-minutes.mp3'
import twoThirtyUrl from '../audio/two-thirty.mp3'

/** Spoken word → bundled file. Keyed by the exact text the clip says. */
export const WORDS: Record<string, string> = {
  ten: tenUrl,
  five: fiveUrl,
  thirty: thirtyUrl,
  'one minute': oneMinuteUrl,
  'one thirty': oneThirtyUrl,
  'two minutes': twoMinutesUrl,
  'two thirty': twoThirtyUrl,
  'three minutes': threeMinutesUrl,
  'three thirty': threeThirtyUrl,
  'four minutes': fourMinutesUrl,
  'four thirty': fourThirtyUrl,
  'five minutes': fiveMinutesUrl,
  'six minutes': sixMinutesUrl,
  'seven minutes': sevenMinutesUrl,
  'eight minutes': eightMinutesUrl,
  'nine minutes': nineMinutesUrl,
  'ten minutes': tenMinutesUrl,
}

/**
 * A call is skipped if it would land within this many seconds of the segment's
 * start, where it would talk over the segment's own "Work"/label announcement.
 * This is what keeps very short intervals sane without a length floor: a 10 s
 * interval loses "TEN" (it would collide) and keeps "FIVE"; a 5 s one goes
 * silent by itself.
 */
const START_GUARD = 1.5

/**
 * The count-up stops this long before the end and hands over to the countdown.
 * Sized so the two ladders never crowd: at 15 s the last rung sits 5 s ahead of
 * "TEN", which is the busiest the pattern ever gets (a 45 s interval).
 * It is also why a 35 s interval gets no "thirty" — at −5 it would be a
 * remaining-time call in a count-up voice.
 */
const END_GUARD = 15

/** What the countdown says, and how many seconds are left when it says it. */
const COUNTDOWN: Array<[number, string]> = [
  [10, 'ten'],
  [5, 'five'],
]

/** Below five minutes the ladder steps every 30 s, above it every minute. */
const FINE_STEP_UNTIL = 300

/** Last rung there is a word for; longer segments simply stop being called. */
const LAST_RUNG = 600

const MINUTES = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
]

/** 30 → "thirty", 60 → "one minute", 90 → "one thirty", 120 → "two minutes". */
function countUpWord(seconds: number): string {
  if (seconds < 60) return 'thirty'
  const minutes = MINUTES[Math.floor(seconds / 60) - 1]
  if (seconds % 60 === 30) return `${minutes} thirty`
  return `${minutes} minute${seconds >= 120 ? 's' : ''}`
}

/** One spoken call, placed `at` seconds after the segment starts. */
export interface TimeCall {
  text: string
  at: number
}

/**
 * Everything a segment says between its start and its final beeps, in order.
 * Empty for rests, the prep countdown, and anything too short to fit a call.
 */
export function timeCallsFor(segment: Segment): TimeCall[] {
  if (segment.type !== 'work') return []
  const calls: TimeCall[] = []
  const { duration } = segment

  for (let at = 30; at <= LAST_RUNG; at += at < FINE_STEP_UNTIL ? 30 : 60) {
    if (at > duration - END_GUARD) break
    calls.push({ text: countUpWord(at), at })
  }
  for (const [remaining, text] of COUNTDOWN) {
    const at = duration - remaining
    if (at >= START_GUARD) calls.push({ text, at })
  }
  return calls
}
