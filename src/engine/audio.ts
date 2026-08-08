/**
 * Beep synthesis via Web Audio. The context is created on the user's Start
 * tap (autoplay policy) and reused for the whole session.
 *
 * Every beep takes a delay (seconds from now) and is scheduled on the
 * AudioContext clock, so a whole session's worth can be queued up front and
 * still fire on time while rAF is throttled in a backgrounded tab.
 */
declare global {
  interface Navigator {
    /** Audio Session API (Safari 17+; feature-detected elsewhere). */
    audioSession?: { type: string }
  }
}

let ctx: AudioContext | null = null
let master: DynamicsCompressorNode | null = null
const pending = new Set<OscillatorNode>()

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
      cancelScheduledBeeps()
      void ctx.close().catch(() => {})
      ctx = null
      master = null
    }
  }
  if (!ctx) {
    ctx = new AudioContext()
    // Beeps are layered oscillators pushed near full scale; the compressor
    // catches the summed peaks so they stay loud without clipping.
    master = ctx.createDynamicsCompressor()
    master.threshold.value = -12
    master.knee.value = 6
    master.ratio.value = 4
    master.attack.value = 0.001
    master.release.value = 0.1
    master.connect(ctx.destination)
    if (ctx.state !== 'running') await tryResume(ctx)
  }
}

export function audioRunning(): boolean {
  return ctx?.state === 'running'
}

/** Silence every beep that hasn't sounded yet (pause, restart, unmount). */
export function cancelScheduledBeeps(): void {
  for (const osc of pending) {
    try {
      osc.stop()
    } catch {
      // Never started or already stopped.
    }
    osc.disconnect()
  }
  pending.clear()
}

function tone(freq: number, duration: number, delay = 0, volume = 0.9): void {
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
  tone(1320, 0.3, delay, 1)
}

/** Lower beep: time to rest. */
export function beepRest(delay = 0): void {
  tone(550, 0.35, delay)
}

/** Ascending triple: session complete. */
export function beepFinish(delay = 0): void {
  tone(660, 0.15, delay)
  tone(880, 0.15, delay + 0.18)
  tone(1320, 0.5, delay + 0.36, 1)
}
