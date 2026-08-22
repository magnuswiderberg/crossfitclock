/**
 * Beep synthesis and clip playback via Web Audio. The context is created on
 * the user's Start tap (autoplay policy) and reused for the whole session.
 *
 * Every sound takes a delay (seconds from now) and is scheduled on the
 * AudioContext clock, so a whole session's worth can be queued up front and
 * still fire on time while rAF is throttled in a backgrounded tab. Voice
 * announcements go through here too (rather than the Web Speech API) so they
 * follow the same audio route as the beeps — on iOS speech is rendered on the
 * system speech session and lands on the phone rather than a paired speaker.
 */
declare global {
  interface Navigator {
    /** Audio Session API (Safari 17+; feature-detected elsewhere). */
    audioSession?: { type: string }
  }
}

let ctx: AudioContext | null = null
let master: DynamicsCompressorNode | null = null
const pending = new Set<AudioScheduledSourceNode>()

/**
 * Resolve once the context reaches 'running', or after a short timeout —
 * WebKit's resume() promise can reject or simply never settle on a context
 * another app's audio session has interrupted.
 */
function tryResume(c: AudioContext): Promise<void> {
  return new Promise((done) => {
    const t = window.setTimeout(done, 400)
    const settle = () => {
      window.clearTimeout(t)
      done()
    }
    c.resume().then(settle, settle)
  })
}

export async function initAudio(): Promise<void> {
  // Mix with, rather than interrupt, music the user has playing (Spotify,
  // YouTube): 'ambient' keeps other audio at full volume. Trade-off: iOS
  // mutes ambient audio while the ringer switch is on silent — the web
  // offers no mode that both mixes and bypasses the switch ('playback'
  // was tried and rejected), so the UI shows iOS users a one-time hint.
  if (navigator.audioSession) navigator.audioSession.type = 'ambient'
  if (ctx && ctx.state !== 'running') {
    await tryResume(ctx)
    // iOS wedges the context when another app (Spotify play/pause) grabs
    // the audio session: the state sticks at 'interrupted' and resume()
    // never brings it back. A fresh context is the only reliable recovery.
    // Outside a user gesture the new one may start suspended — callers
    // retry on the next tap via the pointerdown unlock listener.
    if ((ctx.state as string) !== 'running') {
      cancelScheduledSounds()
      void ctx.close().catch(() => {})
      ctx = null
      master = null
    }
  }
  if (!ctx) {
    ctx = new AudioContext()
    // Beeps are layered oscillators pushed well over full scale, and voice
    // clips are boosted the same way; the compressor squeezes them loud
    // without clipping. Its makeup gain (≈ +5 dB at these settings) is what
    // lifts a spoken word's body, so its ratio stays gentle.
    master = ctx.createDynamicsCompressor()
    master.threshold.value = -12
    master.knee.value = 6
    master.ratio.value = 4
    master.attack.value = 0.001
    master.release.value = 0.1
    // The compressor sets the loudness; the limiter sets the ceiling. With
    // the compressor alone, the one place the beeps and the voice meet — the
    // boundary beep under a label's first syllable — already summed to full
    // scale, so neither could come up without clipping there. A hard limiter
    // catches that sum, and its own makeup gain (≈ +1 dB) goes to everything.
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -2
    limiter.knee.value = 1
    limiter.ratio.value = 20
    limiter.attack.value = 0.001
    limiter.release.value = 0.05
    master.connect(limiter).connect(ctx.destination)
    if (ctx.state !== 'running') await tryResume(ctx)
  }
}

export function audioRunning(): boolean {
  return ctx?.state === 'running'
}

/** Silence every sound that hasn't played yet (pause, restart, unmount). */
export function cancelScheduledSounds(): void {
  for (const src of pending) {
    try {
      src.stop()
    } catch {
      // Never started or already stopped.
    }
    src.disconnect()
  }
  pending.clear()
}

/**
 * Decode clip bytes into a buffer that `playBuffer` can schedule. Returns null
 * when there is no context yet (nothing has unlocked audio) or the bytes
 * aren't decodable audio. Note that decoding detaches `bytes`.
 *
 * The result outlives the context it was decoded on — buffers are not bound to
 * one, which matters because `initAudio` throws the context away and builds a
 * fresh one to recover from an iOS interruption.
 */
export async function decodeClip(bytes: ArrayBuffer): Promise<AudioBuffer | null> {
  if (!ctx) return null
  try {
    return await ctx.decodeAudioData(bytes)
  } catch {
    return null
  }
}

/**
 * What a decoded clip is like, measured once: its loudest sample, and where
 * the speech actually sits inside the buffer. A synthesized clip is padded —
 * the bundled words run 1.6–2.2 s of buffer for well under a second of
 * speech — so anything placing words one after another must go by these, not
 * by `buffer.duration`.
 */
export interface ClipBounds {
  peak: number
  /** Seconds into the buffer where the speech begins. */
  onset: number
  /** Seconds into the buffer where it has ended. */
  end: number
}

/** Below this a sample is silence: −40 dBFS, under the noise floor of an MP3 pause. */
const SILENCE = 0.01

const bounds = new WeakMap<AudioBuffer, ClipBounds>()

export function clipBounds(buffer: AudioBuffer): ClipBounds {
  const known = bounds.get(buffer)
  if (known) return known
  let peak = 0
  let first = buffer.length
  let last = -1
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i])
      if (v > peak) peak = v
      if (v > SILENCE) {
        if (i < first) first = i
        last = i
      }
    }
  }
  // A silent clip has nothing to normalize or to place; treat it as full.
  const result: ClipBounds =
    last < 0
      ? { peak: 1, onset: 0, end: buffer.duration }
      : { peak, onset: first / buffer.sampleRate, end: (last + 1) / buffer.sampleRate }
  bounds.set(buffer, result)
  return result
}

/**
 * Voice clips are normalized to full scale and then pushed this far past it
 * into the master compressor, which limits the peaks. Sized to land a spoken
 * word's body at about the beeps' level: speech carries ~14 dB of peak over
 * body, and the beeps sit near full scale, so a clip played at unity was some
 * 10 dB under them and went missing behind music. Being heard over music is
 * the whole point of the voice — if it ever distorts, this is the one dial.
 */
const VOICE_BOOST = 3

/** Schedule a decoded clip, sharing the compressor (and route) with the beeps. */
export function playBuffer(buffer: AudioBuffer, delay = 0): void {
  if (!ctx || !master) return
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const gain = ctx.createGain()
  gain.gain.value = VOICE_BOOST / clipBounds(buffer).peak
  src.connect(gain).connect(master)
  src.start(ctx.currentTime + delay)
  pending.add(src)
  src.onended = () => {
    pending.delete(src)
    src.disconnect()
    gain.disconnect()
  }
}

/**
 * Beep level before the compressor. The layered oscillators sum to ~1.8× this,
 * so a beep leans on the compressor hard, and turning this up buys mostly
 * compression rather than level (ratio 4: +4 dB in ≈ +1 dB out) — the
 * limiter is what lets it sit this high next to a voice clip at all.
 */
const BEEP_LEVEL = 1.5
/** The "go" and the finish, a notch above the rest. */
const BEEP_ACCENT = 1.7

function tone(freq: number, duration: number, delay = 0, volume = BEEP_LEVEL): void {
  if (!ctx || !master) return
  const t0 = ctx.currentTime + delay
  const gain = ctx.createGain()
  // Fast attack, hold at full level, short exponential release: the sustain
  // (rather than an immediate decay) is what keeps the beep audible over
  // music. Ramps at the edges avoid clicks.
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01)
  gain.gain.setValueAtTime(volume, t0 + Math.max(0.02, duration - 0.06))
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  gain.connect(master)
  // Sine body + square edge (harmonics that cut through music) + sub octave
  // for weight.
  const layers: Array<[OscillatorType, number, number]> = [
    ['sine', freq, 1],
    ['square', freq, 0.3],
    ['sine', freq / 2, 0.5],
  ]
  let live = layers.length
  for (const [type, f, level] of layers) {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = f
    const mix = ctx.createGain()
    mix.gain.value = level
    osc.connect(mix).connect(gain)
    osc.start(t0)
    osc.stop(t0 + duration + 0.05)
    pending.add(osc)
    osc.onended = () => {
      pending.delete(osc)
      osc.disconnect()
      if (--live === 0) gain.disconnect()
    }
  }
}

/** Short tick for the 2-1 countdown before a work interval. */
export function beepCountdown(delay = 0): void {
  tone(880, 0.12, delay)
}

/**
 * Same tick a third lower, for the countdown into a rest: the ear reads the
 * pitch before the beep lands, so you know whether to brace or to stop.
 */
export function beepCountdownRest(delay = 0): void {
  tone(660, 0.12, delay)
}

/** Higher, longer beep: work starts now. */
export function beepGo(delay = 0): void {
  tone(1320, 0.3, delay, BEEP_ACCENT)
}

/** Lower beep: time to rest. */
export function beepRest(delay = 0): void {
  tone(550, 0.35, delay)
}

/** Ascending triple: session complete. */
export function beepFinish(delay = 0): void {
  tone(660, 0.15, delay)
  tone(880, 0.15, delay + 0.18)
  tone(1320, 0.5, delay + 0.36, BEEP_ACCENT)
}
