import { app, HttpRequest, HttpResponseInit } from '@azure/functions'
import { getContainer, type WorkoutDoc } from '../shared/cosmos'
import { readCredentials, verifyCredentials } from '../shared/auth'

/** What the client sends per workout; tombstones carry no workout body. */
interface ClientItem {
  id: string
  updatedAt: number
  deleted?: boolean
  workout?: unknown
}

const MAX_ITEMS = 200

function isValidItem(item: ClientItem): boolean {
  if (typeof item.id !== 'string' || item.id.length === 0 || item.id.length > 64) return false
  if (typeof item.updatedAt !== 'number' || !Number.isFinite(item.updatedAt)) return false
  if (!item.deleted && (typeof item.workout !== 'object' || item.workout === null)) return false
  return true
}

/**
 * Two-way sync in one round trip: merge the client's workouts and tombstones
 * into the store with last-write-wins per workout id, then return the full
 * merged set (tombstones included, so the client can prune local copies of
 * workouts deleted elsewhere).
 */
async function sync(req: HttpRequest): Promise<HttpResponseInit> {
  const creds = readCredentials(req)
  if (!creds) return { status: 401, jsonBody: { error: 'unauthorized' } }
  const container = await getContainer()
  if (!(await verifyCredentials(container, creds))) {
    return { status: 401, jsonBody: { error: 'unauthorized' } }
  }

  let items: ClientItem[]
  try {
    const body = (await req.json()) as { workouts?: unknown }
    if (!Array.isArray(body.workouts) || body.workouts.length > MAX_ITEMS) throw new Error()
    items = body.workouts as ClientItem[]
    if (!items.every(isValidItem)) throw new Error()
  } catch {
    return { status: 400, jsonBody: { error: 'invalid-body' } }
  }

  const { resources: stored } = await container.items
    .query<WorkoutDoc>({
      query: "SELECT * FROM c WHERE c.handle = @handle AND c.type = 'workout'",
      parameters: [{ name: '@handle', value: creds.handle }],
    })
    .fetchAll()
  const byId = new Map(stored.map((d) => [d.id, d]))

  for (const item of items) {
    const docId = `w-${item.id}`
    const existing = byId.get(docId)
    if (existing && existing.updatedAt >= item.updatedAt) continue
    const doc: WorkoutDoc = {
      id: docId,
      handle: creds.handle,
      type: 'workout',
      updatedAt: item.updatedAt,
      deleted: !!item.deleted,
      workout: item.deleted ? null : item.workout,
    }
    await container.items.upsert(doc)
    byId.set(docId, doc)
  }

  const merged = [...byId.values()].map((d) => ({
    id: d.id.slice(2),
    updatedAt: d.updatedAt,
    deleted: d.deleted,
    workout: d.workout,
  }))
  return { status: 200, jsonBody: { workouts: merged } }
}

app.http('sync', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'sync',
  handler: sync,
})
