import { useState } from 'react'
import type { Workout } from '../model/types'
import {
  fetchShare,
  hasLocalEdits,
  hasUnsharedEdits,
  ShareNotFoundError,
  shareFingerprint,
} from '../model/share'

interface Props {
  workout: Workout
  /** Replace this workout with the current snapshot from its origin share. */
  onUpdateFromOrigin: (updated: Workout) => void
}

/**
 * The sharing state of a workout, under the buttons on the detail screen. A
 * share is a snapshot, not a live link, so both roles need telling: an owner
 * that edits are sitting unpushed, a recipient that their copy may have fallen
 * behind. Both are answered from the stored fingerprints — only the recipient's
 * "check" goes to the network, and only when asked.
 */
export function ShareStatus({ workout, onUpdateFromOrigin }: Props) {
  const [checking, setChecking] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const { shared, origin } = workout
  if (!shared && !origin) return null

  const check = async () => {
    if (!origin) return
    setChecking(true)
    setNotice(null)
    try {
      const latest = await fetchShare(origin.code)
      const fingerprint = shareFingerprint(latest)
      if (fingerprint === origin.fingerprint) {
        setNotice(
          hasLocalEdits(workout)
            ? 'The share hasn’t changed since you added it — your edits are the only difference.'
            : 'Up to date — the share hasn’t changed since you added it.',
        )
        return
      }
      const warning = hasLocalEdits(workout)
        ? `Update "${workout.name}" from code ${origin.code}?\n\n` +
          'The shared version has changed. Your own edits to this workout will be replaced.'
        : `Update "${workout.name}" from code ${origin.code}?\n\n` +
          'The shared version has changed — this replaces your copy with it.'
      if (!window.confirm(warning)) return
      // Keep the local id so this stays the same workout everywhere it's
      // already known: history, sync, and the match on the next update.
      onUpdateFromOrigin({ ...latest, id: workout.id })
      setNotice('Updated to the shared version.')
    } catch (err) {
      setNotice(
        err instanceof ShareNotFoundError
          ? `Code ${origin.code} isn’t shared any more — your copy is yours to keep.`
          : err instanceof Error
            ? err.message
            : 'Could not check for updates.',
      )
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="share-status">
      {shared && (
        <p className="sync-note">
          Shared as <span className="sync-code">{shared.code}</span>
          {hasUnsharedEdits(workout)
            ? ' — edited since. Tap Update share to push the changes; people who added it get them when they tap Update from share.'
            : ' — the share matches this workout.'}
        </p>
      )}
      {origin && (
        <>
          <p className="sync-note">
            Added from code <span className="sync-code">{origin.code}</span>
            {hasLocalEdits(workout) && ' — edited since you added it.'}
          </p>
          <button className="btn btn-small" disabled={checking} onClick={() => void check()}>
            {checking ? 'Checking…' : 'Update from share'}
          </button>
        </>
      )}
      {notice && <p className="sync-note">{notice}</p>}
    </div>
  )
}
