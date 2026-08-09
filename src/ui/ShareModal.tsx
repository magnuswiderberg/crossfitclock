import { useEffect, useState } from 'react'
import type { ShareLink, Workout } from '../model/types'
import { isConnected } from '../model/sync'
import { createShare } from '../model/share'

interface Props {
  workout: Workout
  /** Remember the code on the workout, so drift against it can be shown later. */
  onShared: (link: ShareLink) => void
  onClose: () => void
  /** Jump to the Sync screen (sharing needs a connected handle). */
  onOpenSync: () => void
}

/**
 * Creates (or refreshes) the share for a workout and shows its code. The code
 * is deliberately the only thing shared — no URLs, because a tapped link opens
 * the browser instead of the installed PWA on iOS, while a code can be typed
 * straight into whichever flavor of the app the recipient uses.
 *
 * Opening this modal always pushes the current content, so it doubles as the
 * "update the share" action once a workout has been edited.
 */
export function ShareModal({ workout, onShared, onClose, onOpenSync }: Props) {
  const connected = isConnected()
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Whether this open refreshed an existing share, captured before the push.
  const [refreshed] = useState(() => workout.shared !== undefined)

  useEffect(() => {
    if (!connected) return
    let alive = true
    createShare(workout)
      .then((link) => {
        if (!alive) return
        setCode(link.code)
        onShared(link)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : 'Sharing failed.')
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one share per open
  }, [])

  if (!connected) {
    return (
      <div className="hint-overlay" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div className="hint-card">
          <h2 id="share-title">Share workout</h2>
          <p>
            Sharing uses your <strong>sync handle</strong> to remember which codes are yours, so
            you can delete them later. Connect on the Sync screen first — it takes a few seconds
            and needs no email.
          </p>
          <button className="btn btn-primary" onClick={onOpenSync}>
            Open Sync
          </button>
          <button className="btn" onClick={onClose}>
            Not now
          </button>
        </div>
      </div>
    )
  }

  const copy = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      // Clipboard blocked — the code is on screen, nothing else to do.
    }
  }

  const shareText = code
    ? `Add my workout "${workout.name}" in CrossFit Clock: tap “Add from share code” and enter ${code}.`
    : ''

  return (
    <div className="hint-overlay" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div className="hint-card">
        <h2 id="share-title">
          {refreshed ? 'Update share' : 'Share'} “{workout.name}”
        </h2>
        {error ? (
          <p className="sync-error">{error}</p>
        ) : (
          <>
            <div className="share-code-display">{code ?? '····'}</div>
            {refreshed ? (
              <p>
                The code keeps working and now points at this version. Anyone who already added
                it gets the changes when they tap <strong>Update from share</strong> on their
                copy — nothing reaches them until they do.
              </p>
            ) : (
              <p>
                Anyone can add this workout by tapping <strong>Add from share code</strong> on
                their home screen and entering the code. The code stays yours to revoke on the
                Sync screen.
              </p>
            )}
          </>
        )}
        {code && (
          <>
            <button className="btn btn-primary" onClick={copy}>
              {copied ? 'Copied' : 'Copy code'}
            </button>
            {'share' in navigator && (
              <button className="btn" onClick={() => void navigator.share({ text: shareText }).catch(() => {})}>
                Share…
              </button>
            )}
          </>
        )}
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}
