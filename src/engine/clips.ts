/**
 * Announcement clips: spoken text → an AudioBuffer the session can schedule.
 *
 * The fixed vocabulary (Work, Rest, Get ready, Done) ships in the repo and is
 * precached by the service worker, so every preset announces with no network
 * at all — no preset labels an interval. Anything else is an exercise label
 * someone typed, synthesized on demand by /api/speech and then fetched once
 * per device into Cache Storage.
 *
 * A clip is addressed by sha256(voice | style | normalized text). That formula
 * and the voice/style table below are duplicated in
 * api/src/functions/speech.ts and scripts/build-audio.ps1 — change one and the
 * others must follow, or the client asks for clips nothing ever made.
 */
import doneUrl from '../audio/done.mp3'
import getReadyUrl from '../audio/get-ready.mp3'
import restUrl from '../audio/rest.mp3'
import workUrl from '../audio/work.mp3'
import { compile, type Segment } from '../model/compile'
import type { Workout } from '../model/types'
import { decodeClip } from './audio'

/** Work labels are announced with energy; a rest is yelled, as relief. */
export type ClipKind = 'work' | 'rest'

export interface ClipItem {
  text: string
  kind: ClipKind
}

const STYLES: Record<ClipKind, string> = { work: 'excited', rest: 'shouting' }
const VOICE = 'en-US-AriaNeural'

/** Survives page loads; the bundled clips come from the SW precache instead. */
const CACHE_NAME = 'crossfitclock.clips.v1'

const BUNDLED: Record<string, string> = {
  'work|work': workUrl,
  'rest|rest': restUrl,
  'work|get ready': getReadyUrl,
  'work|done': doneUrl,
}

/** Decoded clips for this page load, and the misses, so a 404 isn't refetched. */
const buffers = new Map<string, AudioBuffer | null>()

/**
 * Trim, collapse whitespace, lowercase — so "Burpees", "burpees " and
 * "BURPEES" are one clip. Must match the server's normalize().
 */
function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

function cacheId(item: ClipItem): string {
  return `${item.kind}|${normalize(item.text)}`
}

/** True for the four words that ship in the repo — no backend needed. */
export function isBundled(item: ClipItem): boolean {
  return cacheId(item) in BUNDLED
}

async function clipKey(item: ClipItem): Promise<string | null> {
  // Absent on insecure origins. Those can't run a service worker either, so
  // there is nothing to fall back to but Web Speech.
  if (!crypto?.subtle) return null
  const source = `${VOICE}|${STYLES[item.kind]}|${normalize(item.text)}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** The URL a clip's bytes come from, or null if we can't address it. */
async function clipUrl(item: ClipItem): Promise<string | null> {
  const bundled = BUNDLED[cacheId(item)]
  if (bundled) return bundled
  const key = await clipKey(item)
  return key && `/api/speech/${key}`
}

/**
 * True when this device already holds a clip's audio. Content addressing is
 * what makes this conclusive: the key is a hash of what was said, so bytes
 * under that key cannot go stale and the server has nothing to add.
 */
async function haveBytes(item: ClipItem): Promise<boolean> {
  if (cachedClip(item)) return true
  if (!('caches' in window)) return false
  const key = await clipKey(item)
  if (!key) return false
  try {
    const cache = await caches.open(CACHE_NAME)
    return (await cache.match(`/api/speech/${key}`)) !== undefined
  } catch {
    return false
  }
}

/**
 * Fetch bytes, preferring the persistent clip cache. Bundled clips skip it —
 * the service worker already holds them, and a second copy would just go
 * stale across deploys.
 */
async function fetchBytes(url: string): Promise<ArrayBuffer | null> {
  const persist = url.startsWith('/api/')
  try {
    const cache = persist && 'caches' in window ? await caches.open(CACHE_NAME) : null
    const hit = await cache?.match(url)
    if (hit) return await hit.arrayBuffer()
    const res = await fetch(url)
    if (!res.ok) return null
    if (cache) await cache.put(url, res.clone())
    return await res.arrayBuffer()
  } catch {
    // Offline, or storage refused the write — the caller falls back to speech.
    return null
  }
}

/** Resolutions in flight, so one word repeated across a session fetches once. */
const inflight = new Map<string, Promise<AudioBuffer | null>>()

async function resolveClip(id: string, item: ClipItem): Promise<AudioBuffer | null> {
  const url = await clipUrl(item)
  const bytes = url ? await fetchBytes(url) : null
  const buffer = bytes ? await decodeClip(bytes) : null
  // A null because audio isn't unlocked yet would be wrong to remember; that
  // resolves itself on the next tap. A missing clip is worth remembering.
  if (buffer || bytes === null) buffers.set(id, buffer)
  return buffer
}

/**
 * Resolve one announcement to a playable buffer, or null when there is none
 * (never synthesized, offline, no audio context yet). Every outcome is
 * memoized, so a session's worth of scheduling costs one lookup per distinct
 * announcement.
 */
export function clipFor(item: ClipItem): Promise<AudioBuffer | null> {
  const id = cacheId(item)
  const known = buffers.get(id)
  if (known !== undefined) return Promise.resolve(known)
  let pending = inflight.get(id)
  if (!pending) {
    pending = resolveClip(id, item).finally(() => inflight.delete(id))
    inflight.set(id, pending)
  }
  return pending
}

/** Memoized buffer, if it has already been resolved. */
export function cachedClip(item: ClipItem): AudioBuffer | null {
  return buffers.get(cacheId(item)) ?? null
}

/** What a segment announces as it starts. */
export function announcementFor(seg: Segment): ClipItem {
  if (seg.type === 'prep') return { text: 'Get ready', kind: 'work' }
  // Unlabeled work reads "Work", matching what the screen shows.
  if (seg.type === 'work') return { text: seg.label, kind: 'work' }
  return { text: 'Rest', kind: 'rest' }
}

/** Said at the end of the last segment. */
export const FINISH_ANNOUNCEMENT: ClipItem = { text: 'Done', kind: 'work' }

/** Everything a session can say, deduplicated — one clip covers every repeat. */
export function announcementsIn(segments: Segment[]): ClipItem[] {
  const items = new Map<string, ClipItem>()
  for (const seg of segments) {
    const item = announcementFor(seg)
    items.set(cacheId(item), item)
  }
  if (items.size > 0) items.set(cacheId(FINISH_ANNOUNCEMENT), FINISH_ANNOUNCEMENT)
  return [...items.values()]
}

/** Everything a workout can say. */
export function vocabularyOf(workout: Workout): ClipItem[] {
  return announcementsIn(compile(workout))
}

/** Mirrors the server's per-request cap. */
const MAX_ITEMS = 20

/** Answered-for this page load, so repeat triggers don't re-ask. */
const ensured = new Set<string>()

export interface ClipProgress {
  done: number
  total: number
}

interface EnsuredClip {
  text: string
  kind: ClipKind
  key?: string
  status: 'ready' | 'pending' | 'failed'
}

/**
 * Make sure every custom label here has been synthesized, and pull the audio
 * down so the workout can later run offline. The bundled words are skipped —
 * they need no backend at all, which is why every preset does not.
 *
 * Fire-and-forget by design: the caller has already saved, and a clip that
 * doesn't arrive costs an announcement in the Web Speech voice, not a failure.
 * A "pending" clip means the free tier's rate cap was hit, so it is left
 * un-ensured and the next trigger asks again.
 *
 * Anything this device already has is dropped before the request, so a
 * workout that has been run once costs nothing on every later visit — which
 * matters because the server answers each item with a Cosmos point read, and
 * this runs on open and on start, not just on save.
 */
export async function ensureClips(
  items: ClipItem[],
  onProgress?: (p: ClipProgress) => void,
): Promise<void> {
  const unknown = items.filter((item) => !isBundled(item) && !ensured.has(cacheId(item)))
  if (unknown.length === 0) return

  const held = await Promise.all(unknown.map(haveBytes))
  const wanted = unknown.filter((item, i) => {
    // Remember it too, so repeat triggers this page load skip the lookup.
    if (held[i]) ensured.add(cacheId(item))
    return !held[i]
  })
  if (wanted.length === 0) return

  const total = wanted.length
  let done = 0
  onProgress?.({ done, total })

  for (let at = 0; at < wanted.length; at += MAX_ITEMS) {
    const batch = wanted.slice(at, at + MAX_ITEMS)
    let clips: EnsuredClip[]
    try {
      const res = await fetch('/api/speech', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: batch.map(({ text, kind }) => ({ text, kind })) }),
      })
      if (!res.ok) return
      clips = ((await res.json()) as { clips: EnsuredClip[] }).clips
    } catch {
      // Offline, or the endpoint isn't configured — try again next time.
      return
    }

    for (const clip of clips) {
      const item: ClipItem = { text: clip.text, kind: clip.kind }
      if (clip.status === 'ready' && clip.key) await fetchBytes(`/api/speech/${clip.key}`)
      // "failed" is permanent for this text (unspeakable, or no key on the
      // server), so it counts as answered too — a reload retries it.
      if (clip.status !== 'pending') ensured.add(cacheId(item))
      onProgress?.({ done: ++done, total })
    }
  }
}

/** Synthesize whatever a workout's custom labels need. */
export function ensureWorkoutClips(
  workout: Workout,
  onProgress?: (p: ClipProgress) => void,
): Promise<void> {
  return ensureClips(vocabularyOf(workout), onProgress)
}
