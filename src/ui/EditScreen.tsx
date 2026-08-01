import { useMemo, useState } from 'react'
import { uid, type Workout } from '../model/types'
import { compile, formatTime, totalDuration } from '../model/compile'

interface Props {
  workout: Workout
  onSave: (w: Workout) => void
  onCancel: () => void
}

interface NumProps {
  label: string
  value: number
  min?: number
  onChange: (n: number) => void
}

function NumField({ label, value, min = 0, onChange }: NumProps) {
  return (
    <div className="edit-field num">
      <label>{label}</label>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10)
          onChange(Number.isNaN(n) ? min : Math.max(min, n))
        }}
      />
    </div>
  )
}

export function EditScreen({ workout, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<Workout>(() => structuredClone(workout))

  const update = (mutate: (w: Workout) => void) => {
    setDraft((d) => {
      const copy = structuredClone(d)
      mutate(copy)
      return copy
    })
  }

  const problems = useMemo(() => {
    const list: string[] = []
    if (!draft.name.trim()) list.push('The workout needs a name.')
    if (draft.blocks.length === 0) list.push('Add at least one block.')
    for (const b of draft.blocks) {
      if (!b.label.trim()) list.push('Every block needs a label.')
      if (b.sets.length === 0) list.push(`Block "${b.label || '…'}" needs at least one set.`)
      for (const s of b.sets) {
        if (!s.label.trim()) list.push('Every set needs a label.')
        if (s.intervals.length === 0) list.push(`Set "${s.label || '…'}" needs at least one interval.`)
      }
    }
    // Nominal totalDuration counts rest-only workouts, so check the compiled
    // timeline: no work segments means nothing to run.
    if (compile(draft).length === 0) list.push('Add some work time — the workout is empty.')
    return [...new Set(list)]
  }, [draft])

  return (
    <div className="screen edit-screen">
      <div className="screen-head">
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <span className="total-line">Total {formatTime(totalDuration(draft))}</span>
        <button
          className="btn btn-primary"
          disabled={problems.length > 0}
          style={problems.length > 0 ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
          onClick={() => onSave(draft)}
        >
          Save
        </button>
      </div>

      <div className="edit-field">
        <label>Workout name</label>
        <input
          value={draft.name}
          onChange={(e) => update((w) => (w.name = e.target.value))}
          placeholder="e.g. Classic Tabata"
        />
      </div>

      <div className="edit-field">
        <label>Description (optional)</label>
        <textarea
          rows={2}
          value={draft.description ?? ''}
          onChange={(e) => update((w) => (w.description = e.target.value || undefined))}
          placeholder="Intention, background, or the rep scheme inside each interval"
        />
      </div>

      {problems.length > 0 && <div className="invalid-hint">{problems[0]}</div>}

      {draft.blocks.map((block, bi) => (
        <div key={block.id} className="block-card">
          <div className="card-head">
            <div className="edit-field">
              <label>Block</label>
              <input
                value={block.label}
                onChange={(e) => update((w) => (w.blocks[bi].label = e.target.value))}
                placeholder="e.g. Warm-up, Main, Stretch"
              />
            </div>
            <button
              className="btn btn-danger"
              onClick={() => update((w) => w.blocks.splice(bi, 1))}
            >
              ✕
            </button>
          </div>

          {block.sets.map((set, si) => (
            <div key={set.id} className="set-card">
              <div className="card-head">
                <div className="edit-field">
                  <label>Set</label>
                  <input
                    value={set.label}
                    onChange={(e) => update((w) => (w.blocks[bi].sets[si].label = e.target.value))}
                    placeholder="e.g. 20 / 10"
                  />
                </div>
                <NumField
                  label="Rounds"
                  min={1}
                  value={set.rounds}
                  onChange={(n) => update((w) => (w.blocks[bi].sets[si].rounds = n))}
                />
                <button
                  className="btn btn-danger"
                  onClick={() => update((w) => w.blocks[bi].sets.splice(si, 1))}
                >
                  ✕
                </button>
              </div>

              {set.intervals.map((iv, ii) => (
                <div key={iv.id} className="interval-row">
                  <div className="edit-field">
                    <label>Exercise (optional)</label>
                    <input
                      value={iv.label ?? ''}
                      onChange={(e) =>
                        update(
                          (w) =>
                            (w.blocks[bi].sets[si].intervals[ii].label =
                              e.target.value || undefined),
                        )
                      }
                      placeholder="e.g. Burpees"
                    />
                  </div>
                  <NumField
                    label="Work s"
                    value={iv.work}
                    onChange={(n) => update((w) => (w.blocks[bi].sets[si].intervals[ii].work = n))}
                  />
                  <NumField
                    label="Rest s"
                    value={iv.rest}
                    onChange={(n) => update((w) => (w.blocks[bi].sets[si].intervals[ii].rest = n))}
                  />
                  <button
                    className="btn btn-danger"
                    onClick={() => update((w) => w.blocks[bi].sets[si].intervals.splice(ii, 1))}
                  >
                    ✕
                  </button>
                </div>
              ))}

              <div className="row">
                <NumField
                  label="Set rest s"
                  value={set.restAfterSet}
                  onChange={(n) => update((w) => (w.blocks[bi].sets[si].restAfterSet = n))}
                />
                <span className="grow" />
                <button
                  className="add-btn"
                  onClick={() =>
                    update((w) =>
                      w.blocks[bi].sets[si].intervals.push({ id: uid(), work: 20, rest: 10 }),
                    )
                  }
                >
                  + Interval
                </button>
              </div>
            </div>
          ))}

          <button
            className="add-btn"
            onClick={() =>
              update((w) =>
                w.blocks[bi].sets.push({
                  id: uid(),
                  label: `Set ${w.blocks[bi].sets.length + 1}`,
                  rounds: 8,
                  intervals: [{ id: uid(), work: 20, rest: 10 }],
                  restAfterSet: 0,
                }),
              )
            }
          >
            + Add set
          </button>
        </div>
      ))}

      <button
        className="add-btn"
        onClick={() =>
          update((w) =>
            w.blocks.push({
              id: uid(),
              label: `Block ${w.blocks.length + 1}`,
              sets: [
                {
                  id: uid(),
                  label: 'Set 1',
                  rounds: 8,
                  intervals: [{ id: uid(), work: 20, rest: 10 }],
                  restAfterSet: 0,
                },
              ],
            }),
          )
        }
      >
        + Add block
      </button>
    </div>
  )
}
