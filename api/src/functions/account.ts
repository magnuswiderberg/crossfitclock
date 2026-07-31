import { app, HttpRequest, HttpResponseInit } from '@azure/functions'
import { getContainer, type AccountDoc } from '../shared/cosmos'
import { generateSecret, hashSecret, readCredentials, verifyCredentials, HANDLE_RE } from '../shared/auth'

async function claim(req: HttpRequest): Promise<HttpResponseInit> {
  let handle: string
  try {
    const body = (await req.json()) as { handle?: unknown }
    handle = String(body.handle ?? '').trim().toLowerCase()
  } catch {
    return { status: 400, jsonBody: { error: 'invalid-body' } }
  }
  if (!HANDLE_RE.test(handle)) {
    return { status: 400, jsonBody: { error: 'invalid-handle' } }
  }

  const secret = generateSecret()
  const doc: AccountDoc = {
    id: 'account',
    handle,
    type: 'account',
    secretHash: hashSecret(secret),
    createdAt: Date.now(),
  }
  const container = await getContainer()
  try {
    await container.items.create(doc)
  } catch (err) {
    if ((err as { code?: number }).code === 409) {
      return { status: 409, jsonBody: { error: 'handle-taken' } }
    }
    throw err
  }
  return { status: 201, jsonBody: { handle, secret } }
}

async function login(req: HttpRequest): Promise<HttpResponseInit> {
  const creds = readCredentials(req)
  if (!creds) return { status: 401, jsonBody: { error: 'unauthorized' } }
  const container = await getContainer()
  const ok = await verifyCredentials(container, creds)
  return ok ? { status: 204 } : { status: 401, jsonBody: { error: 'unauthorized' } }
}

app.http('accountClaim', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'account/claim',
  handler: claim,
})

app.http('accountLogin', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'account/login',
  handler: login,
})
