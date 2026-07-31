import type { Workout } from '../model/types'
import { formatTime, totalDuration } from '../model/compile'
import { initAudio } from '../engine/audio'

interface Props {
  workouts: Workout[]
  onStart: (w: Workout) => void
  onEdit: (w: Workout) => void
  onNew: () => void
  onDuplicate: (w: Workout) => void
  onDelete: (w: Workout) => void
}

function describe(w: Workout): string {
  const sets = w.blocks.reduce((n, b) => n + b.sets.length, 0)
  const blocks = w.blocks.length
  const blockPart = blocks > 1 ? `${blocks} blocks` : w.blocks[0]?.label ?? ''
  return `${formatTime(totalDuration(w))} · ${blockPart} · ${sets} ${sets === 1 ? 'set' : 'sets'}`
}

export function HomeScreen({ workouts, onStart, onEdit, onNew, onDuplicate, onDelete }: Props) {
  return (
    <div className="screen">
      <div className="screen-head">
        <h1 className="app-title">CrossFit Clock</h1>
        <button className="btn" onClick={onNew}>
          New
        </button>
      </div>

      {workouts.map((w) => (
        <div key={w.id} className="workout-card">
          <h2>{w.name}</h2>
          <div className="workout-meta">
            {describe(w)}
            {w.preset && <span className="preset-tag">Preset</span>}
          </div>
          <div className="workout-actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                // AudioContext must be created inside a user gesture.
                void initAudio()
                onStart(w)
              }}
            >
              Start
            </button>
            {!w.preset && (
              <button className="btn" onClick={() => onEdit(w)}>
                Edit
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => onDuplicate(w)}>
              Copy
            </button>
            {!w.preset && (
              <>
                <span className="spacer" />
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    if (window.confirm(`Delete "${w.name}"?`)) onDelete(w)
                  }}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
