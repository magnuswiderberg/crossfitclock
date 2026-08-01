import { useState } from 'react'
import type { Workout } from '../model/types'
import { formatTime, totalDuration } from '../model/compile'
import { initAudio } from '../engine/audio'
import { primeSpeech } from '../engine/speech'
import { SilentHintModal, isIos } from './SilentHint'

interface Props {
  workouts: Workout[]
  onStart: (w: Workout) => void
  onInspect: (w: Workout) => void
  onNew: () => void
  onSync: () => void
}

function describe(w: Workout): string {
  const sets = w.blocks.reduce((n, b) => n + b.sets.length, 0)
  const parts = [formatTime(totalDuration(w))]
  if (w.blocks.length > 1) parts.push(`${w.blocks.length} blocks`)
  parts.push(`${sets} ${sets === 1 ? 'set' : 'sets'}`)
  return parts.join(' · ')
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

export function HomeScreen({ workouts, onStart, onInspect, onNew, onSync }: Props) {
  const own = workouts.filter((w) => !w.preset)
  const presets = workouts.filter((w) => w.preset)
  const [showHint, setShowHint] = useState(false)

  return (
    <div className="screen">
      <div className="screen-head">
        <h1 className="app-title">CrossFit Clock</h1>
        <button className="btn btn-ghost" onClick={onSync}>
          Sync
        </button>
      </div>

      <h2 className="section-title">My workouts</h2>
      {own.map((w) => (
        <WorkoutCard key={w.id} workout={w} onStart={onStart} onInspect={onInspect} />
      ))}
      <button className="workout-new" onClick={onNew}>
        ＋ New workout
      </button>

      {presets.length > 0 && (
        <>
          <h2 className="section-title">Presets</h2>
          {presets.map((w) => (
            <WorkoutCard key={w.id} workout={w} onStart={onStart} onInspect={onInspect} />
          ))}
        </>
      )}

      {isIos() && (
        <button className="hint-link" onClick={() => setShowHint(true)}>
          Beeps &amp; Silent Mode
        </button>
      )}
      {showHint && <SilentHintModal onClose={() => setShowHint(false)} />}
    </div>
  )
}
