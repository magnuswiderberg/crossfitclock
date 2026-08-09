/**
 * Seed the easter-egg share code.
 *
 * The landing page prints 7K4M as its example code, and the finish-screen
 * screenshots carry a QR for it — so it may as well resolve to a real workout.
 * Run from `infra/deploy.ps1` after a deploy, with COSMOS_ENDPOINT and
 * COSMOS_KEY in the environment. Idempotent: re-running refreshes the snapshot
 * and keeps the original createdAt.
 *
 * Lives under api/ so `@azure/cosmos` resolves from the API's node_modules, and
 * because the document it writes is the API's schema (see src/shared/cosmos.ts).
 */
import { CosmosClient } from '@azure/cosmos'

const CODE = '7K4M'
/**
 * Deliberately unclaimable. `owner` is what gates listing and deleting a share,
 * and HANDLE_RE (/^[a-z0-9][a-z0-9-]{2,19}$/) rejects underscores — so nobody
 * can ever claim this handle and revoke the egg out from under us.
 */
const OWNER = '__seed__'
const WORKOUT_ID = 'seed-easter-egg'

const workout = {
  id: WORKOUT_ID,
  name: 'You Found It',
  description:
    'You typed the code off the website, which means you were paying attention. ' +
    'Here are four honest minutes for your trouble: alternate the two, and don’t pace it.',
  version: 1,
  blocks: [
    {
      id: 'egg-block',
      label: 'Main',
      sets: [
        {
          id: 'egg-set',
          label: 'Tabata',
          rounds: 4,
          intervals: [
            { id: 'egg-a', label: 'Burpees', work: 20, rest: 10 },
            { id: 'egg-b', label: 'Air squats', work: 20, rest: 10 },
          ],
          restAfterSet: 0,
        },
      ],
    },
  ],
}

const endpoint = process.env.COSMOS_ENDPOINT
const key = process.env.COSMOS_KEY
if (!endpoint || !key) {
  console.error('seed-share: COSMOS_ENDPOINT / COSMOS_KEY not set')
  process.exit(1)
}

const container = new CosmosClient({ endpoint, key })
  .database(process.env.COSMOS_DATABASE ?? 'crossfitclock')
  .container('data')

const partition = `share#${CODE}`
const now = Date.now()

// Keep the original createdAt across re-runs; a share's age is the one thing a
// re-seed shouldn't rewrite.
let createdAt = now
try {
  const { resource } = await container.item('share', partition).read()
  if (resource?.createdAt) createdAt = resource.createdAt
} catch (err) {
  if (err?.code !== 404) throw err
}

await container.items.upsert({
  id: 'share',
  handle: partition,
  type: 'share',
  code: CODE,
  owner: OWNER,
  workoutId: WORKOUT_ID,
  name: workout.name,
  workout,
  createdAt,
  updatedAt: now,
})

console.log(`seed-share: ${CODE} -> "${workout.name}"`)
