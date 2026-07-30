/**
 * Beep synthesis via Web Audio. The context is created on the user's Start
 * tap (autoplay policy) and reused for the whole session.
 *
 * Every beep takes a delay (seconds from now) and is scheduled on the
 * AudioContext clock, so a whole session's worth can be queued up front and
 * still fire on time while rAF is throttled in a backgrounded tab.
 */
let ctx: AudioContext | null = null
const pending = new Set<OscillatorNode>()

export async function initAudio(): Promise<void> {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      // Needs a user gesture; callers retry on the next tap.
    }
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
  pending.add(osc)
  osc.onended = () => {
    pending.delete(osc)
    osc.disconnect()
  }
}

/** Short tick for the 2-1 countdown before a work interval. */
export function beepCountdown(delay = 0): void {
  tone(880, 0.12, delay)
}

/** Higher, longer beep: work starts now. */
export function beepGo(delay = 0): void {
  tone(1320, 0.3, delay, 0.6)
}

/** Lower beep: time to rest. */
export function beepRest(delay = 0): void {
  tone(550, 0.35, delay)
}

/** Ascending triple: session complete. */
export function beepFinish(delay = 0): void {
  tone(660, 0.15, delay)
  tone(880, 0.15, delay + 0.18)
  tone(1320, 0.5, delay + 0.36, 0.6)
}
