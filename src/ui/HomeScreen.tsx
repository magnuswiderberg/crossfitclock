import type { Workout } from '../model/types'
import { formatTime, totalDuration } from '../model/compile'
import { initAudio } from '../engine/audio'
import { primeSpeech } from '../engine/speech'

interface Props {
  workouts: Workout[]
  onStart: (w: Workout) => void
  onInspect: (w: Workout) => void
  onNew: () => void
}

function describe(w: Workout): string {
  const sets = w.blocks.reduce((n, b) => n + b.sets.length, 0)
  const blocks = w.blocks.length
  const blockPart = blocks > 1 ? `${blocks} blocks` : w.blocks[0]?.label ?? ''
  return `${formatTime(totalDuration(w))} · ${blockPart} · ${sets} ${sets === 1 ? 'set' : 'sets'}`
}

interface CardProps {
  workout: Workout
  onStart: (w: Workout) => void
  onInspect: (w: Workout) => void
}

function WorkoutCard({ workout: w, onStart, onInspect }: CardProps) {
  return (
    <div className="workout-card">
      <button className="workout-info" onClick={() => onInspect(w)}>
        <span className="workout-stack">
          <span className="workout-name">{w.name}</span>
          <span className="workout-meta">{describe(w)}</span>
        </span>
        <span className="workout-chevron" aria-hidden="true">
          ›
        </span>
      </button>
      <div className="workout-actions">
        <button
          className="btn btn-primary"
          onClick={() => {
            // AudioContext must be created inside a user gesture.
            void initAudio()
            primeSpeech()
            onStart(w)
          }}
        >
          Start
        </button>
      </div>
    </div>
  )
}

export function HomeScreen({ workouts, onStart, onInspect, onNew }: Props) {
  const own = workouts.filter((w) => !w.preset)
  const presets = workouts.filter((w) => w.preset)

  return (
    <div className="screen">
      <div className="screen-head">
        <h1 className="app-title">CrossFit Clock</h1>
        <button className="btn" onClick={onNew}>
          New
        </button>
      </div>

      {own.length > 0 && (
        <>
          <h2 className="section-title">My workouts</h2>
          {own.map((w) => (
            <WorkoutCard key={w.id} workout={w} onStart={onStart} onInspect={onInspect} />
          ))}
        </>
      )}

      {presets.length > 0 && (
        <>
          <h2 className="section-title">Presets</h2>
          {presets.map((w) => (
            <WorkoutCard key={w.id} workout={w} onStart={onStart} onInspect={onInspect} />
          ))}
        </>
      )}
    </div>
  )
}
