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
import type { SessionRestore } from '../engine/useSession'
import { HomeScreen } from './HomeScreen'
import { EditScreen } from './EditScreen'
import { RunScreen } from './RunScreen'
import { DetailScreen } from './DetailScreen'

type View =
  | { name: 'home' }
  | { name: 'detail'; workout: Workout }
  | { name: 'edit'; workout: Workout; isNew: boolean }
  | { name: 'run'; workout: Workout; restore?: SessionRestore }

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

  useEffect(() => {
    saveWorkouts(workouts)
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
          setWorkouts((list) =>
            view.isNew ? [...list, w] : list.map((x) => (x.id === w.id ? w : x)),
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
      <DetailScreen
        workout={w}
        onStart={() => setView({ name: 'run', workout: w })}
        onEdit={() => setView({ name: 'edit', workout: w, isNew: false })}
        onCopy={() => setView({ name: 'edit', workout: duplicateWorkout(w), isNew: true })}
        onDelete={() => {
          setWorkouts((list) => list.filter((x) => x.id !== w.id))
          setView({ name: 'home' })
        }}
        onBack={() => setView({ name: 'home' })}
      />
    )
  }

  return (
    <HomeScreen
      workouts={workouts}
      onStart={(w) => setView({ name: 'run', workout: w })}
      onInspect={(w) => setView({ name: 'detail', workout: w })}
      onNew={() => setView({ name: 'edit', workout: emptyWorkout(), isNew: true })}
    />
  )
}
