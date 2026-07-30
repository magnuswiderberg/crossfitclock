/**
 * Beep synthesis via Web Audio. The context is created on the user's Start
 * tap (autoplay policy) and reused for the whole session.
 */
let ctx: AudioContext | null = null

export function initAudio(): void {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
}

function tone(freq: number, duration: number, delay = 0, volume = 0.5): void {
  if (!ctx) return
  const t0 = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  // Fast attack / exponential release avoids clicks.
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(gain).connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.05)
}

/** Short tick for the 2-1 countdown before a work interval. */
export function beepCountdown(): void {
  tone(880, 0.12)
}

/** Higher, longer beep: work starts now. */
export function beepGo(): void {
  tone(1320, 0.3, 0, 0.6)
}

/** Lower beep: time to rest. */
export function beepRest(): void {
  tone(550, 0.35)
}

/** Ascending triple: session complete. */
export function beepFinish(): void {
  tone(660, 0.15)
  tone(880, 0.15, 0.18)
  tone(1320, 0.5, 0.36, 0.6)
}
