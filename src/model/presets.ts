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
              restBetweenRounds: 0,
              restAfterSet: 0,
            },
          ],
        },
      ],
    },
    {
      id: uid(),
      name: 'Double Tabata',
      version: 1,
      blocks: [
        {
          id: uid(),
          label: 'Main',
          sets: [
            {
              id: uid(),
              label: 'Tabata A',
              rounds: 8,
              intervals: [interval(20, 10)],
              restBetweenRounds: 0,
              restAfterSet: 60,
            },
            {
              id: uid(),
              label: 'Tabata B',
              rounds: 8,
              intervals: [interval(20, 10)],
              restBetweenRounds: 0,
              restAfterSet: 0,
            },
          ],
        },
      ],
    },
    {
      id: uid(),
      name: 'Full Session',
      version: 1,
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
              restBetweenRounds: 0,
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
                interval(40, 15, 'Air squats'),
              ],
              restBetweenRounds: 45,
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
              restBetweenRounds: 0,
              restAfterSet: 0,
            },
          ],
        },
      ],
    },
  ]
}
