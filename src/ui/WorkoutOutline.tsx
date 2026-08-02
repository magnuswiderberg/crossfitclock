import type { Workout } from '../model/types'
import { formatTime } from '../model/compile'

/** Read-only block/set/interval listing, shared by the detail and import screens. */
export function WorkoutOutline({ workout }: { workout: Workout }) {
  return (
    <>
      {workout.blocks.map((block) => (
        <div key={block.id} className="block-card">
          {workout.blocks.length > 1 && <div className="detail-block-label">{block.label}</div>}

          {block.sets.map((set) => (
            <div key={set.id} className="set-card">
              <div className="detail-row detail-set-head">
                <span>{set.label}</span>
                <span className="detail-times">
                  {set.rounds} {set.rounds === 1 ? 'round' : 'rounds'}
                </span>
              </div>

              {set.intervals.map((iv) => (
                <div key={iv.id} className="detail-row">
                  <span>{iv.label?.trim() || 'Work'}</span>
                  <span className="detail-times">
                    {formatTime(iv.work)}
                    {iv.rest > 0 && ` · rest ${formatTime(iv.rest)}`}
                  </span>
                </div>
              ))}

              {set.restAfterSet > 0 && (
                <div className="detail-row detail-rest">
                  <span>Set rest</span>
                  <span className="detail-times">{formatTime(set.restAfterSet)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  )
}
