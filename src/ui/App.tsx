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
import { ensureWorkoutClips, type ClipProgress } from '../engine/clips'
import type { SessionRestore } from '../engine/useSession'
import { HomeScreen } from './HomeScreen'
import { EditScreen } from './EditScreen'
import { RunScreen } from './RunScreen'
import { DetailScreen } from './DetailScreen'
import { SyncScreen } from './SyncScreen'
import { ImportScreen } from './ImportScreen'
import { ShareModal } from './ShareModal'
import { SilentHintModal, dismissSilentHint, silentHintPending } from './SilentHint'

type View =
  | { name: 'home' }
  | { name: 'detail'; workout: Workout }
  | { name: 'edit'; workout: Workout; isNew: boolean }
  | { name: 'run'; workout: Workout; restore?: SessionRestore }
  | { name: 'sync' }
  | { name: 'import' }

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
  // Workout whose share modal is open (from the detail screen).
  const [shareTarget, setShareTarget] = useState<Workout | null>(null)
  // Custom-label clip synthesis in flight, when it was triggered by something
  // the user just did (a save, an import) and deserves a progress line.
  const [clipProgress, setClipProgress] = useState<ClipProgress | null>(null)

  /**
   * Have the backend synthesize any custom exercise labels this workout
   * announces. Never blocks: the workout is already saved, and a clip that
   * doesn't arrive just means the Web Speech fallback speaks that label. It is
   * retried whenever the workout is opened, started or saved again.
   */
  const prepareAudio = (w: Workout, showProgress = false) => {
    void ensureWorkoutClips(w, showProgress ? setClipProgress : undefined).finally(() =>
      setClipProgress(null),
    )
  }

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
    // A share modal left open (e.g. system back skipped its Done button)
    // must not resurface on the next detail screen.
    setShareTarget(null)
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
    // Too late for this session's announcements, but it is the retry that
    // matters: a label that failed to synthesize gets another chance every
    // time the workout is run.
    prepareAudio(w)
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

  // The clip progress line rides above every screen, so a save can return to
  // the home screen while its audio is still being prepared.
  const screen = () => {
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
            prepareAudio(stamped, true)
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
            onShare={() => setShareTarget(w)}
            onDelete={() => {
              recordDeletion(w.id)
              setWorkouts((list) => list.filter((x) => x.id !== w.id))
              goHome()
            }}
            onBack={goHome}
          />
          {shareTarget && (
            <ShareModal
              workout={shareTarget}
              onClose={() => setShareTarget(null)}
              onOpenSync={() => {
                setShareTarget(null)
                navigate({ name: 'sync' })
              }}
            />
          )}
          {hintGate}
        </>
      )
    }

    if (view.name === 'sync') {
      return <SyncScreen workouts={workouts} onWorkoutsChange={setWorkouts} onBack={goHome} />
    }

    if (view.name === 'import') {
      return (
        <ImportScreen
          onAdd={(w) => {
            // fetchShare already rebuilt it with fresh ids; stamp it as edited
            // now so the next background sync pushes it to this account.
            const added = { ...w, updatedAt: Date.now() }
            setWorkouts((list) => [...list, added])
            prepareAudio(added, true)
            goHome()
          }}
          onBack={goHome}
        />
      )
    }

    return (
      <>
        <HomeScreen
          workouts={workouts}
          onStart={startSession}
          onInspect={(w) => {
            prepareAudio(w)
            navigate({ name: 'detail', workout: w })
          }}
          onNew={() => navigate({ name: 'edit', workout: emptyWorkout(), isNew: true })}
          onImport={() => navigate({ name: 'import' })}
          onSync={() => navigate({ name: 'sync' })}
        />
        {hintGate}
      </>
    )
  }

  return (
    <>
      {screen()}
      {clipProgress && (
        <p className="clip-progress" role="status">
          Preparing audio {clipProgress.done}/{clipProgress.total}
        </p>
      )}
    </>
  )
}
