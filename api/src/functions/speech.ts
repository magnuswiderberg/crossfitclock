import { createHash } from 'node:crypto'
import { app, HttpRequest, HttpResponseInit } from '@azure/functions'
import { clipPartition, getContainer, type ClipDoc } from '../shared/cosmos'

/**
 * Voice announcements, synthesized once and shared by everyone. A clip is
 * identified by a hash of voice, style and normalized text — nothing about
 * who asked for it — so the same exercise label typed by two people is one
 * synthesis and one document.
 *
 * Both routes are anonymous: recipients of a share code have no account, and
 * on the free F0 Speech tier there is no spend to protect. Abuse hits the
 * rate cap, not a bill.
 */
const VOICE = 'en-US-AriaNeural'

/**
 * Chosen by ear. Work labels are shouted with energy; a rest is *yelled* as
 * relief after the effort, which reads warmer than a neutral read of the same
 * word. Both are part of the clip key, so changing them is safe.
 */
const STYLES = { work: 'excited', rest: 'shouting' } as const
type Kind = keyof typeof STYLES

/** MP3 at a bitrate that survives a Bluetooth speaker without bloating docs. */
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'

const MAX_TEXT_LENGTH = 40
const MAX_ITEMS = 20

interface ClipRequest {
  text: string
  kind: Kind
}

type ClipStatus = 'ready' | 'pending' | 'failed'

/**
 * Trim, collapse whitespace, lowercase — so "Burpees", "burpees " and
 * "BURPEES" are one clip. Synthesis is case-insensitive in practice, and the
 * announcement should not depend on how the label was capitalized.
 */
function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

function clipKey(text: string, style: string): string {
  return createHash('sha256').update(`${VOICE}|${style}|${text}`).digest('hex')
}

/** Reject control characters; they cannot be spoken and break the SSML. */
function isSpeakable(text: string): boolean {
  return text.length > 0 && text.length <= MAX_TEXT_LENGTH && !/[\p{C}]/u.test(text)
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Synthesize one clip. Returns the MP3, or null when the service refused —
 * the caller reports that per clip rather than failing the batch, because the
 * client's fallback (Web Speech) is always available.
 */
async function synthesize(text: string, style: string): Promise<Buffer | null> {
  const key = process.env.SPEECH_KEY
  const region = process.env.SPEECH_REGION
  if (!key || !region) return null

  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
    `xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">` +
    `<voice name="${VOICE}"><mstts:express-as style="${style}">` +
    `${escapeXml(text)}</mstts:express-as></voice></speak>`

  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
      'User-Agent': 'crossfitclock',
    },
    body: ssml,
  })
  if (!res.ok) return null
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Resolve one clip: point-read it, and synthesize + store it on a miss.
 * Idempotent — a concurrent create loses the race with a 409 and still
 * reports the clip as ready, since the winner stored identical bytes.
 */
async function resolveClip(item: ClipRequest): Promise<ClipStatus> {
  const text = normalize(item.text)
  const style = STYLES[item.kind]
  const key = clipKey(text, style)
  const container = await getContainer()

  const { resource } = await container.item('clip', clipPartition(key)).read<ClipDoc>()
  if (resource) return 'ready'

  const audio = await synthesize(text, style)
  // Most likely a 429 against F0's 20-per-minute cap. "pending" tells the
  // client to ask again later rather than to give up on this text forever.
  if (!audio) return 'pending'

  const doc: ClipDoc = {
    id: 'clip',
    handle: clipPartition(key),
    type: 'clip',
    key,
    text,
    voice: VOICE,
    style,
    audio: audio.toString('base64'),
    createdAt: Date.now(),
  }
  try {
    await container.items.create(doc)
  } catch (err) {
    if ((err as { code?: number }).code !== 409) throw err
  }
  return 'ready'
}

/**
 * Ensure clips exist for a batch of announcements. The client calls this in
 * the background after a save or an import; it never blocks anything the user
 * is waiting on, so a partial result is fine.
 */
async function ensure(req: HttpRequest): Promise<HttpResponseInit> {
  let items: ClipRequest[]
  try {
    const body = (await req.json()) as { items?: unknown }
    if (!Array.isArray(body.items) || body.items.length === 0) throw new Error()
    if (body.items.length > MAX_ITEMS) throw new Error()
    items = body.items as ClipRequest[]
    for (const item of items) {
      if (typeof item?.text !== 'string' || !(item?.kind in STYLES)) throw new Error()
    }
  } catch {
    return { status: 400, jsonBody: { error: 'invalid-body' } }
  }

  const clips = []
  // Sequential on purpose: the F0 tier allows 20 requests per 60 seconds, and
  // a parallel burst is the reliable way to trip it.
  for (const item of items) {
    const text = normalize(item.text)
    if (!isSpeakable(text)) {
      clips.push({ text: item.text, kind: item.kind, status: 'failed' as ClipStatus })
      continue
    }
    const status = await resolveClip(item)
    clips.push({
      text: item.text,
      kind: item.kind,
      key: clipKey(text, STYLES[item.kind]),
      status,
    })
  }
  return { status: 200, jsonBody: { clips } }
}

/** Fetch one clip's audio. Public, and immutable: the key is its content. */
async function fetchClip(req: HttpRequest): Promise<HttpResponseInit> {
  const key = (req.params.key ?? '').trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(key)) return { status: 404, jsonBody: { error: 'not-found' } }

  const container = await getContainer()
  const { resource } = await container.item('clip', clipPartition(key)).read<ClipDoc>()
  if (!resource) return { status: 404, jsonBody: { error: 'not-found' } }

  return {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
    body: Buffer.from(resource.audio, 'base64'),
  }
}

app.http('speechEnsure', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'speech',
  handler: ensure,
})

app.http('speechClip', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'speech/{key}',
  handler: fetchClip,
})
