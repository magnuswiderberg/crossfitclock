import type { Workout } from '../model/types'
import { formatTime, totalDuration } from '../model/compile'
import { initAudio } from '../engine/audio'
import { primeSpeech } from '../engine/speech'
import { VoiceToggle } from './VoiceToggle'

interface Props {
  workout: Workout
  onStart: () => void
  onEdit: () => void
  onCopy: () => void
  onDelete: () => void
  onBack: () => void
}

/** Read-only view of a workout, so presets can be inspected before starting or copying. */
export function DetailScreen({ workout, onStart, onEdit, onCopy, onDelete, onBack }: Props) {
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

      {workout.blocks.map((block) => (
        <div key={block.id} className="block-card">
          <div className="detail-block-label">{block.label}</div>

          {block.sets.map((set) => (
            <div key={set.id} className="set-card">
              <div className="detail-row detail-set-head">
                <span>{set.label}</span>
                <span className="detail-times">
                  {set.rounds} {set.rounds === 1 ? 'round' : 'rounds'}
                </span>
              </div>

              {set.intervals.map((iv) => (
                <div key={iv.id} className="detail-row">
                  <span>{iv.label?.trim() || 'Work'}</span>
                  <span className="detail-times">
                    {formatTime(iv.work)}
                    {iv.rest > 0 && ` · rest ${formatTime(iv.rest)}`}
                  </span>
                </div>
              ))}

              {set.restAfterSet > 0 && (
                <div className="detail-row detail-rest">
                  <span>Set rest</span>
                  <span className="detail-times">{formatTime(set.restAfterSet)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      <div className="row">
        <button className="btn" onClick={onCopy}>
          Copy
        </button>
        {!workout.preset && (
          <>
            <button className="btn" onClick={onEdit}>
              Edit
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
    </div>
  )
}
