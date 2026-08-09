import { useState } from 'react'
import type { Workout } from '../model/types'
import { formatTime, totalDuration } from '../model/compile'
import {
  fetchShare,
  findAddedCopy,
  findOwnShare,
  hasLocalEdits,
  hasUnsharedEdits,
  normalizeCode,
} from '../model/share'
import { WorkoutOutline } from './WorkoutOutline'

interface Props {
  workouts: Workout[]
  /** Adds the workout, or replaces the copy already added from the same code. */
  onAdd: (w: Workout) => void
  onBack: () => void
}

/**
 * Enter a share code, preview the workout it points to, add it to My workouts.
 * Entering a code that's already been added updates that copy in place rather
 * than leaving two same-named workouts in the list.
 */
export function ImportScreen({ workouts, onAdd, onBack }: Props) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Workout | null>(null)

  const lookup = async () => {
    setBusy(true)
    setError(null)
    setPreview(null)
    try {
      setPreview(await fetchShare(code))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  // Your own workout under this code beats a copy added from it: there is
  // nothing to import, only something to point at.
  const owned = preview?.origin && findOwnShare(workouts, preview.origin.code)
  const existing = !owned && preview && findAddedCopy(workouts, preview)

  return (
    <div className="screen">
      <div className="screen-head">
        <button className="btn btn-ghost" onClick={onBack}>
          ‹ Back
        </button>
        <h1 className="app-title">Add workout</h1>
        <span />
      </div>

      <p className="sync-note">
        Got a share code from a friend? Enter it here to preview their workout and add it to
        your list.
      </p>

      <div className="row">
        <div className="edit-field grow">
          <label>Share code</label>
          <input
            type="text"
            value={code}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="sync-code-input"
            placeholder="XXXX"
            onChange={(e) => setCode(normalizeCode(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && code && !busy) void lookup()
            }}
          />
        </div>
        <button className="btn btn-primary" disabled={busy || !code} onClick={() => void lookup()}>
          {busy ? 'Looking…' : 'Look up'}
        </button>
      </div>

      {error && <p className="sync-error">{error}</p>}

      {preview && (
        <>
          <h2 className="section-title">{preview.name}</h2>
          <span className="total-line">Total {formatTime(totalDuration(preview))}</span>
          {preview.description?.trim() && <p className="detail-desc">{preview.description}</p>}
          <WorkoutOutline workout={preview} />
          {owned ? (
            <p className="sync-note">
              This is your own share — the workout is already in My workouts as “{owned.name}”.
              {hasUnsharedEdits(owned)
                ? ' You’ve edited it since sharing, so the version above is the older one; open it' +
                  ' and tap Update share to push your changes.'
                : ' Nothing to add.'}
            </p>
          ) : (
            <>
              {existing && (
                <p className="sync-note">
                  You already added this code as “{existing.name}”
                  {hasLocalEdits(existing)
                    ? ' and edited it since — updating replaces your edits with the shared version.'
                    : ' — updating replaces it with the version above.'}
                </p>
              )}
              <button className="btn btn-primary btn-block" onClick={() => onAdd(preview)}>
                {existing ? 'Update my copy' : 'Add to my workouts'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}
