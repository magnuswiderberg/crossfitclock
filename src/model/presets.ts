import { uid, type Workout } from './types'

function interval(work: number, rest: number, label?: string) {
  return { id: uid(), label, work, rest }
}

export function buildPresets(): Workout[] {
  return [
    {
      id: uid(),
      name: 'Classic Tabata',
      version: 1,
      preset: true,
      blocks: [
        {
          id: uid(),
          label: 'Main',
          sets: [
            {
              id: uid(),
              label: '20 / 10',
              rounds: 8,
              intervals: [interval(20, 10)],
              restAfterSet: 0,
            },
          ],
        },
      ],
    },
    {
      id: uid(),
      name: 'Fight Gone Bad',
      version: 1,
      preset: true,
      blocks: [
        {
          id: uid(),
          label: 'Main',
          sets: [
            {
              id: uid(),
              label: '5 stations',
              rounds: 3,
              intervals: [
                interval(60, 0, 'Wall balls'),
                interval(60, 0, 'Sumo deadlift high pulls'),
                interval(60, 0, 'Box jumps'),
                interval(60, 0, 'Push press'),
                interval(60, 0, 'Row (calories)'),
              ],
              restAfterSet: 60,
            },
          ],
        },
      ],
    },
    {
      id: uid(),
      name: 'Full Session',
      version: 1,
      preset: true,
      blocks: [
        {
          id: uid(),
          label: 'Warm-up',
          sets: [
            {
              id: uid(),
              label: 'Easy pace',
              rounds: 3,
              intervals: [interval(30, 10)],
              restAfterSet: 30,
            },
          ],
        },
        {
          id: uid(),
          label: 'Main',
          sets: [
            {
              id: uid(),
              label: 'Circuit',
              rounds: 4,
              intervals: [
                interval(40, 15, 'Burpees'),
                interval(40, 15, 'Kettlebell swings'),
                interval(40, 60, 'Air squats'),
              ],
              restAfterSet: 60,
            },
          ],
        },
        {
          id: uid(),
          label: 'Stretch',
          sets: [
            {
              id: uid(),
              label: 'Holds',
              rounds: 4,
              intervals: [interval(40, 5)],
              restAfterSet: 0,
            },
          ],
        },
      ],
    },
  ]
}
