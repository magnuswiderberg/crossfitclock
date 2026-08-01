import { useEffect, useState } from 'react'
import type { Workout } from '../model/types'
import { compile } from '../model/compile'
import {
  loadWorkouts,
  saveWorkouts,
  duplicateWorkout,
  emptyWorkout,
  loadActiveSession,
  clearActiveSession,
} from '../model/storage'
import { isConnected, recordDeletion, syncNow } from '../model/sync'
import type { SessionRestore } from '../engine/useSession'
import { HomeScreen } from './HomeScreen'
import { EditScreen } from './EditScreen'
import { RunScreen } from './RunScreen'
import { DetailScreen } from './DetailScreen'
import { SyncScreen } from './SyncScreen'
import { SilentHintModal, dismissSilentHint, silentHintPending } from './SilentHint'

type View =
  | { name: 'home' }
  | { name: 'detail'; workout: Workout }
  | { name: 'edit'; workout: Workout; isNew: boolean }
  | { name: 'run'; workout: Workout; restore?: SessionRestore }
  | { name: 'sync' }

/** Reopen a session that was still in progress when the page last unloaded. */
function initialView(): View {
  const active = loadActiveSession()
  if (active) {
    const total = compile(active.workout).reduce((sum, s) => sum + s.duration, 0)
    const elapsed = ((active.pausedAt ?? Date.now()) - active.startedAt) / 1000
    if (elapsed < total) {
      return {
        name: 'run',
        workout: active.workout,
        restore: { startedAt: active.startedAt, pausedAt: active.pausedAt },
      }
    }
    clearActiveSession()
  }
  return { name: 'home' }
}

export function App() {
  const [workouts, setWorkouts] = useState<Workout[]>(loadWorkouts)
  const [view, setView] = useState<View>(initialView)
  // A Start held back by the one-time iOS silent-switch hint; the session
  // begins when the hint is dismissed.
  const [pendingStart, setPendingStart] = useState<Workout | null>(null)

  const startSession = (w: Workout) => {
    if (silentHintPending()) setPendingStart(w)
    else setView({ name: 'run', workout: w })
  }

  const hintGate = pendingStart && (
    <SilentHintModal
      onClose={() => {
        dismissSilentHint()
        setPendingStart(null)
        setView({ name: 'run', workout: pendingStart })
      }}
    />
  )

  useEffect(() => {
    saveWorkouts(workouts)
  }, [workouts])

  // Background sync: shortly after load and after every change. Applying the
  // merged result only when it differs keeps this from looping — the follow-up
  // sync finds nothing new and stops. Failures are silent; offline is normal.
  useEffect(() => {
    if (!isConnected()) return
    const t = window.setTimeout(async () => {
      try {
        const merged = await syncNow(workouts)
        if (!merged) return
        setWorkouts((current) =>
          JSON.stringify(merged) === JSON.stringify(current) ? current : merged,
        )
      } catch {
        // Offline or server trouble — next change or app load retries.
      }
    }, 1500)
    return () => window.clearTimeout(t)
  }, [workouts])

  if (view.name === 'run') {
    return (
      <RunScreen
        workout={view.workout}
        restore={view.restore}
        onExit={() => setView({ name: 'home' })}
      />
    )
  }

  if (view.name === 'edit') {
    return (
      <EditScreen
        workout={view.workout}
        onSave={(w) => {
          const stamped = { ...w, updatedAt: Date.now() }
          setWorkouts((list) =>
            view.isNew ? [...list, stamped] : list.map((x) => (x.id === w.id ? stamped : x)),
          )
          setView({ name: 'home' })
        }}
        onCancel={() => setView({ name: 'home' })}
      />
    )
  }

  if (view.name === 'detail') {
    const w = view.workout
    return (
      <>
        <DetailScreen
          workout={w}
          onStart={() => startSession(w)}
          onEdit={() => setView({ name: 'edit', workout: w, isNew: false })}
          onCopy={() => setView({ name: 'edit', workout: duplicateWorkout(w), isNew: true })}
          onDelete={() => {
            recordDeletion(w.id)
            setWorkouts((list) => list.filter((x) => x.id !== w.id))
            setView({ name: 'home' })
          }}
          onBack={() => setView({ name: 'home' })}
        />
        {hintGate}
      </>
    )
  }

  if (view.name === 'sync') {
    return (
      <SyncScreen
        workouts={workouts}
        onWorkoutsChange={setWorkouts}
        onBack={() => setView({ name: 'home' })}
      />
    )
  }

  return (
    <>
      <HomeScreen
        workouts={workouts}
        onStart={startSession}
        onInspect={(w) => setView({ name: 'detail', workout: w })}
        onNew={() => setView({ name: 'edit', workout: emptyWorkout(), isNew: true })}
        onSync={() => setView({ name: 'sync' })}
      />
      {hintGate}
    </>
  )
}
