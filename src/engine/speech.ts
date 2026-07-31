/**
 * Voice announcements via the Web Speech API. Opt-in and layered on top of
 * the beeps, never a replacement: unlike beeps, utterances cannot be
 * pre-scheduled on an audio clock, so they fire from the rAF tick loop and
 * simply don't happen while the tab is throttled in the background.
 */
const KEY = 'crossfitclock.voice.v1'

let enabled = (() => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
})()

let primed = false

export function speechSupported(): boolean {
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
  return enabled && speechSupported()
}

export function setVoiceEnabled(on: boolean): void {
  enabled = on
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // Storage full/blocked — the in-memory flag still works this session.
  }
  if (!on) cancelSpeech()
}

/**
 * Speak an empty utterance inside a user gesture (Start tap, first tap after
 * a reload) — iOS ignores speech that was never gesture-unlocked.
 */
export function primeSpeech(): void {
  if (primed || !voiceEnabled()) return
  primed = true
  speechSynthesis.speak(new SpeechSynthesisUtterance(''))
}

export function speak(text: string): void {
  if (!voiceEnabled()) return
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

export function cancelSpeech(): void {
  if (speechSupported()) speechSynthesis.cancel()
}
