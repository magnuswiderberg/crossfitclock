import type { Workout } from '../model/types'
import { formatTime, totalDuration } from '../model/compile'
import { hasUnsharedEdits } from '../model/share'
import { initAudio } from '../engine/audio'
import { primeSpeech } from '../engine/speech'
import { ShareStatus } from './ShareStatus'
import { VoiceToggle } from './VoiceToggle'
import { WorkoutOutline } from './WorkoutOutline'

interface Props {
  workout: Workout
  onStart: () => void
  onEdit: () => void
  onCopy: () => void
  onShare: () => void
  onUpdateFromOrigin: (updated: Workout) => void
  onDelete: () => void
  onBack: () => void
}

/** Read-only view of a workout, so presets can be inspected before starting or copying. */
export function DetailScreen({
  workout,
  onStart,
  onEdit,
  onCopy,
  onShare,
  onUpdateFromOrigin,
  onDelete,
  onBack,
}: Props) {
  return (
    <div className="screen">
      <div className="screen-head">
        <button className="btn btn-ghost" onClick={onBack}>
          Back
        </button>
        <span className="total-line">Total {formatTime(totalDuration(workout))}</span>
        <button
          className="btn btn-primary"
          onClick={() => {
            // AudioContext must be created inside a user gesture.
            void initAudio()
            primeSpeech()
            onStart()
          }}
        >
          Start
        </button>
      </div>

      <h1 className="app-title">
        {workout.name}
        {workout.preset && <span className="preset-tag">Preset</span>}
      </h1>

      {workout.description?.trim() && <p className="detail-desc">{workout.description}</p>}

      <VoiceToggle />

      <WorkoutOutline workout={workout} />

      <div className="row">
        <button className="btn" onClick={onCopy}>
          Copy
        </button>
        {!workout.preset && (
          <>
            <button className="btn" onClick={onEdit}>
              Edit
            </button>
            <button className="btn" onClick={onShare}>
              {hasUnsharedEdits(workout) ? 'Update share' : 'Share'}
            </button>
            <span className="grow" />
            <button
              className="btn btn-danger"
              onClick={() => {
                if (window.confirm(`Delete "${workout.name}"?`)) onDelete()
              }}
            >
              Delete
            </button>
          </>
        )}
      </div>

      <ShareStatus workout={workout} onUpdateFromOrigin={onUpdateFromOrigin} />
    </div>
  )
}
