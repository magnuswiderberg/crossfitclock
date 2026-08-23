/**
 * Home-screen nudge to install the app as a PWA. Chromium browsers fire
 * `beforeinstallprompt`, which we stash so our Install button can launch the
 * real native prompt; iOS Safari has no install API at all, so there the
 * button opens Share → Add to Home Screen instructions instead. Nothing
 * renders once the app is already running standalone.
 *
 * Two exports: `InstallHint` is the banner (above the presets, until
 * dismissed); `InstallLink` is the quiet link that takes over at the bottom
 * of the screen afterwards. They swap live via the shared listener set.
 */
import { useEffect, useState } from 'react'
import { HelpLink } from './HelpLink'
import { isIos } from './SilentHint'

const KEY = 'crossfitclock.installhint.v1'

/** Chromium-only event; not in lib.dom, so declare the bits we use. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

window.addEventListener('beforeinstallprompt', (e) => {
  // Suppress Chrome's own mini-infobar; the home-screen banner takes over.
  e.preventDefault()
  deferredPrompt = e as BeforeInstallPromptEvent
})

window.addEventListener('appinstalled', () => {
  deferredPrompt = null
  dismissInstallHint()
})

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS home-screen apps report standalone here, not via display-mode.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function installHintDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return true // storage blocked — fall back to the quiet link
  }
}

function dismissInstallHint(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Storage blocked — the banner returns next session, which is harmless.
  }
  listeners.forEach((fn) => fn())
}

/** Dismissed flag kept in sync across the banner and the link. */
function useInstallDismissed(): boolean {
  const [dismissed, setDismissed] = useState(installHintDismissed)
  useEffect(() => {
    const update = () => setDismissed(installHintDismissed())
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [])
  return dismissed
}

/**
 * Launch the native install prompt when the browser offered one; otherwise
 * fall back to the manual-instructions modal via `openInstructions`.
 */
async function install(openInstructions: () => void): Promise<void> {
  const ev = deferredPrompt
  if (!ev) {
    openInstructions()
    return
  }
  deferredPrompt = null // a prompt event is single-use
  await ev.prompt()
  const { outcome } = await ev.userChoice
  if (outcome === 'accepted') dismissInstallHint()
}

function InstructionsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="hint-overlay" role="dialog" aria-modal="true" aria-labelledby="install-title">
      <div className="hint-card">
        <h2 id="install-title">Install the app</h2>
        {isIos() ? (
          <p>
            In <strong>Safari</strong>, tap the <strong>Share</strong> button, then{' '}
            <strong>Add to Home Screen</strong>.
          </p>
        ) : (
          <p>
            Open your browser&rsquo;s menu and choose <strong>Install app</strong> (sometimes
            called <strong>Add to Home screen</strong>).
          </p>
        )}
        <HelpLink section="install">More about installing in the help page</HelpLink>
        <button className="btn btn-primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  )
}

/** Banner offering to install the PWA; disappears once dismissed. */
export function InstallHint() {
  const dismissed = useInstallDismissed()
  const [showModal, setShowModal] = useState(false)

  if (isStandalone() || dismissed) return null

  return (
    <>
      <div className="install-banner">
        <p>
          <strong>Add CrossFit Clock to your home screen</strong> — full screen without browser
          bars, works offline, one tap from your workout.
        </p>
        <div className="install-actions">
          <button className="btn btn-accent" onClick={() => void install(() => setShowModal(true))}>
            Install
          </button>
          <button className="btn btn-ghost" onClick={dismissInstallHint}>
            Not now
          </button>
        </div>
      </div>
      {showModal && <InstructionsModal onClose={() => setShowModal(false)} />}
    </>
  )
}

/** Quiet link that keeps installing reachable after the banner is dismissed. */
export function InstallLink() {
  const dismissed = useInstallDismissed()
  const [showModal, setShowModal] = useState(false)

  if (isStandalone() || !dismissed) return null

  return (
    <>
      <button className="hint-link" onClick={() => void install(() => setShowModal(true))}>
        Install as app
      </button>
      {showModal && <InstructionsModal onClose={() => setShowModal(false)} />}
    </>
  )
}
