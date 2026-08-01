import { useEffect, useRef, useState } from 'react'
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

  // One history entry marks "somewhere below home", so the system back
  // button/gesture (browser tabs, Android PWAs) returns to the home screen
  // instead of leaving the app. history.state survives a reload while the
  // entry is on the stack, hence the initializer.
  const subEntryRef = useRef<boolean>(Boolean(history.state?.sub))
  const viewRef = useRef(view)
  viewRef.current = view
  // The run screen registers a hook here; returning true means it swallowed
  // the back press (paused the clock) instead of leaving the screen.
  const runBackRef = useRef<(() => boolean) | null>(null)

  const navigate = (v: View) => {
    if (v.name !== 'home' && !subEntryRef.current) {
      history.pushState({ sub: true }, '')
      subEntryRef.current = true
    }
    setView(v)
  }

  /** Return home, popping the entry `navigate` pushed (if any). */
  const goHome = () => {
    if (subEntryRef.current) history.back() // popstate handler shows home
    else setView({ name: 'home' })
  }

  useEffect(() => {
    // A session restored in a fresh tab/PWA launch starts on the run screen
    // with nothing pushed yet.
    if (viewRef.current.name !== 'home' && !subEntryRef.current) {
      history.pushState({ sub: true }, '')
      subEntryRef.current = true
    }
    const onPop = (e: PopStateEvent) => {
      subEntryRef.current = Boolean(e.state?.sub)
      if (viewRef.current.name === 'run') {
        // Back during a run pauses first; restore the entry so the next
        // back press is caught too. A second back (already paused, or on
        // the done screen) ends the session, same as the Exit button.
        if (runBackRef.current?.()) {
          if (!subEntryRef.current) {
            history.pushState({ sub: true }, '')
            subEntryRef.current = true
          }
          return
        }
        clearActiveSession()
      }
      setView({ name: 'home' })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const startSession = (w: Workout) => {
    if (silentHintPending()) setPendingStart(w)
    else navigate({ name: 'run', workout: w })
  }

  const hintGate = pendingStart && (
    <SilentHintModal
      onClose={() => {
        dismissSilentHint()
        setPendingStart(null)
        navigate({ name: 'run', workout: pendingStart })
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
        onExit={goHome}
        backRef={runBackRef}
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
          goHome()
        }}
        onCancel={goHome}
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
          onEdit={() => navigate({ name: 'edit', workout: w, isNew: false })}
          onCopy={() => navigate({ name: 'edit', workout: duplicateWorkout(w), isNew: true })}
          onDelete={() => {
            recordDeletion(w.id)
            setWorkouts((list) => list.filter((x) => x.id !== w.id))
            goHome()
          }}
          onBack={goHome}
        />
        {hintGate}
      </>
    )
  }

  if (view.name === 'sync') {
    return (
      <SyncScreen workouts={workouts} onWorkoutsChange={setWorkouts} onBack={goHome} />
    )
  }

  return (
    <>
      <HomeScreen
        workouts={workouts}
        onStart={startSession}
        onInspect={(w) => navigate({ name: 'detail', workout: w })}
        onNew={() => navigate({ name: 'edit', workout: emptyWorkout(), isNew: true })}
        onSync={() => navigate({ name: 'sync' })}
      />
      {hintGate}
    </>
  )
}
