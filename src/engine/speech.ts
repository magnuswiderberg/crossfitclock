/**
 * Voice announcements. Opt-in and layered on top of the beeps, never a
 * replacement.
 *
 * Announcements are pre-rendered clips scheduled on the AudioContext clock
 * next to the beeps (see clips.ts), so they come out of whatever device the
 * beeps do and survive rAF throttling in a backgrounded tab. The Web Speech
 * API remains the fallback for anything with no clip — an exercise label that
 * was never synthesized, or a first run offline. Worse routing beats silence,
 * but utterances have no clock, so a fallback announcement is fired from a
 * timer and simply doesn't happen while the tab is throttled.
 */
import { playBuffer } from './audio'
import { cachedClip, clipFor, type ClipItem } from './clips'

const KEY = 'crossfitclock.voice.v1'
const CALLS_KEY = 'crossfitclock.timecalls.v1'

function stored(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function remember(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0')
  } catch {
    // Storage full/blocked — the in-memory flag still works this session.
  }
}

let enabled = stored(KEY)
let calls = stored(CALLS_KEY)

let primed = false

/** Pending fallback utterances, so a pause can silence them. */
const timers = new Set<number>()

/** Bumped by every cancel, so a clip resolving late knows it was dropped. */
let generation = 0

function speechSupported(): boolean {
  return 'speechSynthesis' in window
}

/**
 * The browser default is often the worst voice on offer (Windows' old SAPI
 * ones especially), so prefer the neural/network tiers when present: Edge's
 * "... (Natural)", Chrome's "Google ...", iOS' downloaded Enhanced/Premium.
 */
function pickVoice(): SpeechSynthesisVoice | null {
  const score = (v: SpeechSynthesisVoice) =>
    (/\bnatural\b/i.test(v.name) ? 8 : 0) +
    (/google/i.test(v.name) ? 6 : 0) +
    (/enhanced|premium/i.test(v.name) ? 4 : 0) +
    // Windows' legacy SAPI voices all read "Microsoft <name> - <language>";
    // anything named otherwise (e.g. a natural voice like "Jasper") beats
    // them, while Edge's "Microsoft ... (Natural)" still wins via the bonus.
    (/^microsoft .* - /i.test(v.name) ? 0 : 2) +
    (v.lang === 'en-US' ? 1 : 0)
  const english = speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith('en'))
  return english.sort((a, b) => score(b) - score(a))[0] ?? null
}

let voice: SpeechSynthesisVoice | null = null
if (speechSupported()) {
  voice = pickVoice()
  // Chrome/Android load the voice list async, after first getVoices().
  speechSynthesis.addEventListener('voiceschanged', () => {
    voice = pickVoice()
  })
}

export function voiceEnabled(): boolean {
  return enabled
}

export function setVoiceEnabled(on: boolean): void {
  enabled = on
  remember(KEY, on)
  if (!on) cancelAnnouncements()
}

/**
 * Time calls — the "thirty … one minute …" count-up through a long hold and
 * the "TEN"/"FIVE" run-in at the end. A peer of the announcements rather than
 * a sub-option of them: for a group working off one clock across the room, the
 * numbers can be the only thing worth saying.
 */
export function timeCallsEnabled(): boolean {
  return calls
}

export function setTimeCallsEnabled(on: boolean): void {
  calls = on
  remember(CALLS_KEY, on)
  if (!on) cancelAnnouncements()
}

/** Whether this particular announcement is switched on. */
function speaks(item: ClipItem): boolean {
  return item.kind === 'call' ? calls : enabled
}

/**
 * Speak an empty utterance inside a user gesture (Start tap, first tap after
 * a reload) — iOS ignores speech that was never gesture-unlocked. Only the
 * fallback path needs this; clips ride the AudioContext, which `initAudio`
 * unlocks on the same gestures.
 */
export function primeSpeech(): void {
  if (primed || !enabled || !speechSupported()) return
  primed = true
  speechSynthesis.speak(new SpeechSynthesisUtterance(''))
}

function speakNow(text: string): void {
  if (!speechSupported()) return
  primed = true
  speechSynthesis.cancel()
  // Chrome can be left wedged in a paused state after cancel().
  speechSynthesis.resume()
  const utter = new SpeechSynthesisUtterance(text)
  if (voice) utter.voice = voice
  utter.lang = voice?.lang ?? 'en-US'
  utter.rate = 1.05
  speechSynthesis.speak(utter)
}

/**
 * Resolve every announcement a session will make up front, so scheduling them
 * is a synchronous walk with no round trips mid-session. Failures resolve to
 * "no clip", which is the fallback's cue.
 */
export async function prepareAnnouncements(items: ClipItem[]): Promise<void> {
  await Promise.all(items.filter(speaks).map((item) => clipFor(item)))
}

function fallback(text: string, delay: number): void {
  if (!speechSupported()) return
  if (delay <= 0) {
    speakNow(text)
    return
  }
  const timer = window.setTimeout(() => {
    timers.delete(timer)
    speakNow(text)
  }, delay * 1000)
  timers.add(timer)
}

/**
 * Announce `item` in `delay` seconds. A clip goes on the audio clock, where it
 * is exact and survives backgrounding; without one, a timer falls back to the
 * browser voice.
 *
 * An unresolved clip (the toggle was switched on mid-session, so nothing was
 * preloaded) is fetched here and scheduled against whatever delay is left when
 * it lands — unless a cancel intervened first.
 */
export function announce(item: ClipItem, delay = 0): void {
  if (!speaks(item)) return
  const clip = cachedClip(item)
  if (clip) {
    playBuffer(clip, delay)
    return
  }
  const due = performance.now() + delay * 1000
  const gen = generation
  void clipFor(item).then((late) => {
    if (gen !== generation || !speaks(item)) return
    const left = (due - performance.now()) / 1000
    if (late) playBuffer(late, Math.max(0, left))
    // Time calls never fall back: their whole value is that the number is true
    // when you hear it, and an utterance fired from a timer can land late or
    // not at all. A missed "thirty" costs nothing; a late one misleads someone
    // who is counting on it to decide when to drop out.
    else if (item.kind !== 'call') fallback(item.text, left)
  })
}

/**
 * A one-word preview when a toggle is switched on, which doubles as the
 * gesture that unlocks audio for the rest of the session.
 */
async function sample(item: ClipItem, spoken: string): Promise<void> {
  const clip = await clipFor(item)
  if (clip) playBuffer(clip)
  // A time call has no fallback voice, so there is nothing to preview with.
  else if (item.kind !== 'call') speakNow(spoken)
}

export function sampleVoice(): Promise<void> {
  return sample({ text: 'Work', kind: 'work' }, 'Voice announcements on')
}

export function sampleTimeCall(): Promise<void> {
  return sample({ text: 'ten', kind: 'call' }, '')
}

/** Drop pending fallback utterances. Clips are cancelled with the beeps. */
export function cancelAnnouncements(): void {
  generation++
  for (const timer of timers) window.clearTimeout(timer)
  timers.clear()
  if (speechSupported()) speechSynthesis.cancel()
}
