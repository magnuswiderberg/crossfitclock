import { uid, type Workout } from './types'

function interval(work: number, rest: number, label?: string) {
  return { id: uid(), label, work, rest }
}

export function buildPresets(): Workout[] {
  return [
    {
      id: uid(),
      name: 'Classic Tabata',
      description:
        'The original 1996 Tabata protocol: 8 all-out rounds of 20 s work, 10 s rest. Pick one movement and hold maximum intensity.',
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
      name: 'EMOM 10',
      description:
        'Every Minute On the Minute: start a fixed set of reps at the top of each minute and rest for whatever remains. Example: 12 kettlebell swings.',
      version: 1,
      preset: true,
      blocks: [
        {
          id: uid(),
          label: 'Main',
          sets: [
            {
              id: uid(),
              label: 'Every minute',
              rounds: 10,
              intervals: [interval(60, 0)],
              restAfterSet: 0,
            },
          ],
        },
      ],
    },
    {
      id: uid(),
      name: '30 / 30',
      description:
        'Balanced work/rest intervals — a forgiving format for beginners or steady conditioning on the rower, bike, or with bodyweight movements.',
      version: 1,
      preset: true,
      blocks: [
        {
          id: uid(),
          label: 'Main',
          sets: [
            {
              id: uid(),
              label: '30 on / 30 off',
              rounds: 10,
              intervals: [interval(30, 30)],
              restAfterSet: 0,
            },
          ],
        },
      ],
    },
    {
      id: uid(),
      name: '40 / 20',
      description:
        'The classic HIIT circuit ratio: 40 s on, 20 s to transition. Rotate through movements each round or hammer a single one.',
      version: 1,
      preset: true,
      blocks: [
        {
          id: uid(),
          label: 'Main',
          sets: [
            {
              id: uid(),
              label: '40 on / 20 off',
              rounds: 8,
              intervals: [interval(40, 20)],
              restAfterSet: 0,
            },
          ],
        },
      ],
    },
    {
      id: uid(),
      name: 'Fight Gone Bad',
      description:
        'CrossFit benchmark: 1 minute of max reps at each station, no rest between stations, 1 minute between rounds. Score is total reps.',
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
      name: 'The Chief',
      description:
        'CrossFit benchmark: each 3-minute AMRAP is 3 power cleans (60/43 kg), 6 push-ups and 9 air squats on repeat. Score is total rounds across all five cycles.',
      version: 1,
      preset: true,
      blocks: [
        {
          id: uid(),
          label: 'Main',
          sets: [
            {
              id: uid(),
              label: '3 min on / 1 min off',
              rounds: 5,
              intervals: [interval(180, 60, 'AMRAP')],
              restAfterSet: 0,
            },
          ],
        },
      ],
    },
    {
      id: uid(),
      name: 'Full Session',
      description:
        'A template showing a full session shape — warm-up, main circuit and stretching as separate blocks. Copy it and make it yours.',
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
