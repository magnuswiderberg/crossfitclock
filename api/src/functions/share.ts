import { app, HttpRequest, HttpResponseInit } from '@azure/functions'
import { getContainer, sharePartition, type ShareDoc } from '../shared/cosmos'
import {
  ALPHABET,
  generateCode,
  readCredentials,
  verifyCredentials,
  type Credentials,
} from '../shared/auth'

// Codes are treated as public info, so short beats unguessable: 4 chars from
// the 31-char alphabet ≈ 920k combinations, plenty for collision-free creates.
const CODE_LENGTH = 4
const CODE_RE = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`)
const MAX_WORKOUT_BYTES = 20_000
const CREATE_ATTEMPTS = 8

/** Verify the sync credentials on the request, or null → caller returns 401. */
async function authenticate(req: HttpRequest): Promise<Credentials | null> {
  const creds = readCredentials(req)
  if (!creds) return null
  const container = await getContainer()
  return (await verifyCredentials(container, creds)) ? creds : null
}

interface SharedWorkout {
  id: string
  name: string
}

/** Light validation only — the receiving client rebuilds and re-validates. */
function readWorkout(body: unknown): (SharedWorkout & { raw: unknown }) | null {
  const workout = (body as { workout?: unknown } | null)?.workout
  if (typeof workout !== 'object' || workout === null) return null
  const { id, name, blocks } = workout as { id?: unknown; name?: unknown; blocks?: unknown }
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null
  if (typeof name !== 'string' || name.trim().length === 0) return null
  if (!Array.isArray(blocks) || blocks.length === 0) return null
  if (JSON.stringify(workout).length > MAX_WORKOUT_BYTES) return null
  return { id, name: name.trim().slice(0, 100), raw: workout }
}

/**
 * Create a share code for a workout. Re-sharing a workout the account already
 * shared refreshes the stored snapshot and returns the existing code, so a
 * workout maps to one stable code.
 */
async function create(req: HttpRequest, creds: Credentials): Promise<HttpResponseInit> {
  let item: SharedWorkout & { raw: unknown }
  try {
    const parsed = readWorkout(await req.json())
    if (!parsed) throw new Error()
    item = parsed
  } catch {
    return { status: 400, jsonBody: { error: 'invalid-body' } }
  }

  const container = await getContainer()
  const { resources: existing } = await container.items
    .query<ShareDoc>({
      query:
        "SELECT * FROM c WHERE c.type = 'share' AND c.owner = @owner AND c.workoutId = @wid",
      parameters: [
        { name: '@owner', value: creds.handle },
        { name: '@wid', value: item.id },
      ],
    })
    .fetchAll()

  if (existing.length > 0) {
    const doc = existing[0]
    doc.name = item.name
    doc.workout = item.raw
    doc.updatedAt = Date.now()
    await container.item(doc.id, doc.handle).replace(doc)
    return { status: 200, jsonBody: { code: doc.code } }
  }

  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
    const code = generateCode(CODE_LENGTH)
    const doc: ShareDoc = {
      id: 'share',
      handle: sharePartition(code),
      type: 'share',
      code,
      owner: creds.handle,
      workoutId: item.id,
      name: item.name,
      workout: item.raw,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    try {
      await container.items.create(doc)
      return { status: 201, jsonBody: { code } }
    } catch (err) {
      if ((err as { code?: number }).code === 409) continue // collision — reroll
      throw err
    }
  }
  return { status: 503, jsonBody: { error: 'code-space-exhausted' } }
}

/** List the account's shares (metadata only, newest first). */
async function list(creds: Credentials): Promise<HttpResponseInit> {
  const container = await getContainer()
  const { resources } = await container.items
    .query<Pick<ShareDoc, 'code' | 'name' | 'createdAt' | 'updatedAt'>>({
      query:
        "SELECT c.code, c.name, c.createdAt, c.updatedAt FROM c WHERE c.type = 'share' AND c.owner = @owner",
      parameters: [{ name: '@owner', value: creds.handle }],
    })
    .fetchAll()
  resources.sort((a, b) => b.createdAt - a.createdAt)
  return { status: 200, jsonBody: { shares: resources } }
}

async function collection(req: HttpRequest): Promise<HttpResponseInit> {
  const creds = await authenticate(req)
  if (!creds) return { status: 401, jsonBody: { error: 'unauthorized' } }
  return req.method === 'POST' ? create(req, creds) : list(creds)
}

/** Fetch (public — anyone with the code) or delete (owner only) one share. */
async function item(req: HttpRequest): Promise<HttpResponseInit> {
  const code = (req.params.code ?? '').trim().toUpperCase()
  if (!CODE_RE.test(code)) return { status: 404, jsonBody: { error: 'not-found' } }

  const container = await getContainer()
  const { resource } = await container.item('share', sharePartition(code)).read<ShareDoc>()
  if (!resource) return { status: 404, jsonBody: { error: 'not-found' } }

  if (req.method === 'GET') {
    return { status: 200, jsonBody: { name: resource.name, workout: resource.workout } }
  }

  const creds = await authenticate(req)
  if (!creds) return { status: 401, jsonBody: { error: 'unauthorized' } }
  if (resource.owner !== creds.handle) return { status: 403, jsonBody: { error: 'forbidden' } }
  await container.item('share', resource.handle).delete()
  return { status: 204 }
}

app.http('shareCollection', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'share',
  handler: collection,
})

app.http('shareItem', {
  methods: ['GET', 'DELETE'],
  authLevel: 'anonymous',
  route: 'share/{code}',
  handler: item,
})
