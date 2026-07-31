import { useMemo } from 'react'
import type { Workout } from '../model/types'
import { compile, formatTime, type Segment } from '../model/compile'
import { saveActiveSession, clearActiveSession } from '../model/storage'
import { useSession, type SessionRestore } from '../engine/useSession'
import { useWakeLock } from '../engine/wakeLock'
import { VoiceToggle } from './VoiceToggle'

interface Props {
  workout: Workout
  /** Present when reopening a session that survived a page reload. */
  restore?: SessionRestore
  onExit: () => void
}

const PHASE_WORD: Record<Segment['type'], string> = {
  prep: 'Get ready',
  work: 'Work',
  rest: 'Rest',
  setRest: 'Set rest',
}

const PHASE_CLASS: Record<Segment['type'], string> = {
  prep: 'run-prep',
  work: 'run-work',
  rest: 'run-rest',
  setRest: 'run-rest',
}

function nextUpText(seg: Segment, next: Segment | undefined): string {
  if (!next) return 'Finish'
  const changesBlock = next.blockLabel !== seg.blockLabel
  const changesSet = next.setLabel !== seg.setLabel
  const prefix = changesBlock ? `${next.blockLabel} — ` : changesSet ? `${next.setLabel} — ` : ''
  return `${prefix}${next.label} ${formatTime(next.duration)}`
}

export function RunScreen({ workout, restore, onExit }: Props) {
  const segments = useMemo(() => compile(workout), [workout])
  const [snap, controls] = useSession(segments, {
    restore,
    onPersist: (s) => {
      if (s) saveActiveSession({ workout, startedAt: s.startedAt, pausedAt: s.pausedAt })
      else clearActiveSession()
    },
  })
  useWakeLock(snap.status !== 'done')

  const exit = () => {
    clearActiveSession()
    onExit()
  }

  const seg = segments[snap.index]

  if (!seg || snap.status === 'done') {
    const total = segments.reduce((sum, s) => sum + s.duration, 0)
    return (
      <div className="run run-done">
        <div className="done-center">
          <h1>Done</h1>
          <p>
            {workout.name} · {formatTime(total)}
          </p>
        </div>
        <div className="overlay" style={{ position: 'relative', background: 'none', flex: 'none', paddingBottom: 40 }}>
          <button className="btn" onClick={controls.restart}>
            Go again
          </button>
          <button className="btn btn-ghost" onClick={exit}>
            Back to workouts
          </button>
        </div>
      </div>
    )
  }

  const next = segments[snap.index + 1]
  const showRounds = seg.roundsTotal > 1
  const plateCount = showRounds ? seg.roundsTotal : seg.intervalsTotal
  const currentPlate = showRounds ? seg.round : seg.intervalIndex + 1
  const showLabel = seg.type === 'work' && seg.label !== 'Work'

  return (
    <div
      className={`run ${PHASE_CLASS[seg.type]}${snap.countdownActive ? ' countdown' : ''}`}
      onClick={() => {
        if (snap.status === 'running') controls.pause()
      }}
    >
      <div className="run-fill" style={{ height: `${snap.progress * 100}%` }} />

      {import.meta.env.DEV && (
        <button
          aria-label="Dev: jump to next sound"
          style={{
            position: 'absolute',
            top: 56,
            right: 12,
            zIndex: 5,
            padding: '4px 10px',
            font: '600 11px/1.4 monospace',
            color: '#fff',
            background: 'rgba(0,0,0,0.4)',
            border: '1px dashed rgba(255,255,255,0.5)',
            borderRadius: 6,
            cursor: 'pointer',
          }}
          onClick={(e) => {
            e.stopPropagation()
            controls.devJump()
          }}
        >
          ⏭ sound
        </button>
      )}

      <div className="run-top">
        <span>{PHASE_WORD[seg.type]}</span>
        <span className="where">
          {seg.blockLabel} · {seg.setLabel}
          {showRounds && ` · Rd ${seg.round}/${seg.roundsTotal}`}
        </span>
      </div>

      <div className="run-label">{showLabel ? seg.label : ''}</div>

      <div className="run-time">{formatTime(Math.ceil(snap.remaining))}</div>

      {plateCount > 1 && plateCount <= 20 && (
        <div className="run-plates">
          <span className="axle" />
          {Array.from({ length: plateCount }, (_, i) => (
            <i
              key={i}
              className={i < currentPlate - 1 ? 'on' : i === currentPlate - 1 ? 'now' : ''}
            />
          ))}
          <span className="axle" />
        </div>
      )}

      <div className="run-next">
        <span>Next</span>
        <span className="next-text">{nextUpText(seg, next)}</span>
        <button
          className="run-skip"
          aria-label="Skip to next interval"
          onClick={(e) => {
            e.stopPropagation()
            controls.skip()
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 4l10 8-10 8V4zm12 0h3v16h-3z" fill="currentColor" />
          </svg>
        </button>
      </div>

      {snap.status === 'paused' && (
        <div className="overlay" onClick={(e) => e.stopPropagation()}>
          <h2>Paused</h2>
          <button className="btn btn-primary" onClick={controls.resume}>
            Resume
          </button>
          <button className="btn" onClick={controls.restart}>
            Restart
          </button>
          <button className="btn btn-ghost" onClick={exit}>
            End workout
          </button>
          <VoiceToggle />
        </div>
      )}
    </div>
  )
}
