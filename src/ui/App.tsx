import { useEffect, useState } from 'react'
import type { Workout } from '../model/types'
import { loadWorkouts, saveWorkouts, duplicateWorkout, emptyWorkout } from '../model/storage'
import { HomeScreen } from './HomeScreen'
import { EditScreen } from './EditScreen'
import { RunScreen } from './RunScreen'

type View =
  | { name: 'home' }
  | { name: 'edit'; workout: Workout; isNew: boolean }
  | { name: 'run'; workout: Workout }

export function App() {
  const [workouts, setWorkouts] = useState<Workout[]>(loadWorkouts)
  const [view, setView] = useState<View>({ name: 'home' })

  useEffect(() => {
    saveWorkouts(workouts)
  }, [workouts])

  if (view.name === 'run') {
    return <RunScreen workout={view.workout} onExit={() => setView({ name: 'home' })} />
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

  return (
    <HomeScreen
      workouts={workouts}
      onStart={(w) => setView({ name: 'run', workout: w })}
      onEdit={(w) => setView({ name: 'edit', workout: w, isNew: false })}
      onNew={() => setView({ name: 'edit', workout: emptyWorkout(), isNew: true })}
      onDuplicate={(w) => setWorkouts((list) => [...list, duplicateWorkout(w)])}
      onDelete={(w) => setWorkouts((list) => list.filter((x) => x.id !== w.id))}
    />
  )
}
