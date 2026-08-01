/**
 * One-time iOS hint about the ring/silent switch. Beeps run through an
 * 'ambient' audio session so they mix with the user's music, but iOS mutes
 * ambient audio while Silent Mode is on — and the web offers no way to detect
 * the switch, so all we can do is tell the user once (and keep the tip
 * reachable from the home screen).
 */
// v2: v1 flags were set by merely browsing the hint via the home-screen link
// (fixed to no longer dismiss the gate), so start fresh.
const KEY = 'crossfitclock.silenthint.v2'

export function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS masquerades as macOS but is the only "Mac" with a touchscreen.
    (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1)
  )
}

/** True when the hint should gate the next Start tap (iOS, never dismissed). */
export function silentHintPending(): boolean {
  try {
    return isIos() && localStorage.getItem(KEY) !== '1'
  } catch {
    return false
  }
}

export function dismissSilentHint(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Storage blocked — the hint shows again next session, which is harmless.
  }
}

export function SilentHintModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="hint-overlay" role="dialog" aria-modal="true" aria-labelledby="hint-title">
      <div className="hint-card">
        <h2 id="hint-title">Hear the beeps</h2>
        <p>
          Your iPhone <strong>mutes the timer beeps while Silent Mode is on</strong>. Before you
          start, flip the ring/silent switch — or turn off Silent Mode in Control Center.
        </p>
        <p>
          Music from Spotify or YouTube keeps playing at full volume; the beeps simply mix in on
          top.
        </p>
        {/* Marking the hint as seen is the caller's business: only the
            Start-tap gate dismisses it for good — reopening it from the
            home-screen link shouldn't. */}
        <button className="btn btn-primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  )
}
