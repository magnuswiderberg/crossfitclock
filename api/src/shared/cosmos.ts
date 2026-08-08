import { Container, CosmosClient } from '@azure/cosmos'

const CONTAINER_ID = 'data'

let containerPromise: Promise<Container> | undefined

/**
 * Lazily connected singleton. In Azure the database/container are created by
 * Bicep; locally (COSMOS_INIT=true) they are created on first use so the
 * Docker emulator needs no setup.
 */
export function getContainer(): Promise<Container> {
  containerPromise ??= init()
  return containerPromise
}

async function init(): Promise<Container> {
  const endpoint = process.env.COSMOS_ENDPOINT
  const key = process.env.COSMOS_KEY
  if (!endpoint || !key) throw new Error('COSMOS_ENDPOINT / COSMOS_KEY not configured')
  const client = new CosmosClient({ endpoint, key })
  const databaseId = process.env.COSMOS_DATABASE ?? 'crossfitclock'
  if (process.env.COSMOS_INIT === 'true') {
    const { database } = await client.databases.createIfNotExists({ id: databaseId })
    const { container } = await database.containers.createIfNotExists({
      id: CONTAINER_ID,
      partitionKey: { paths: ['/handle'] },
    })
    return container
  }
  return client.database(databaseId).container(CONTAINER_ID)
}

/** Account document, one per handle: id "account" within the handle partition. */
export interface AccountDoc {
  id: 'account'
  handle: string
  type: 'account'
  secretHash: string
  createdAt: number
}

/** Workout document: id "w-<workoutId>". A deletion keeps the doc as a tombstone. */
export interface WorkoutDoc {
  id: string
  handle: string
  type: 'workout'
  updatedAt: number
  deleted: boolean
  workout: unknown | null
}

/**
 * Shared workout, one per share code. Lives in its own partition
 * "share#<CODE>" with a fixed id, so fetching by code is a point read and
 * Cosmos's per-partition id uniqueness turns a code collision into a 409
 * on create.
 */
export interface ShareDoc {
  id: 'share'
  handle: string
  type: 'share'
  code: string
  /** Handle of the account that created the share; only it may delete. */
  owner: string
  /** The owner's workout id, so re-sharing updates the snapshot in place. */
  workoutId: string
  name: string
  workout: unknown
  createdAt: number
  updatedAt: number
}

export function sharePartition(code: string): string {
  return `share#${code}`
}

/**
 * A synthesized announcement. Like ShareDoc it lives alone in its partition
 * ("clip#<key>") under a fixed id, so fetching one is a point read. Clips are
 * not owned: the key is a hash of voice, style and text, so the same words
 * from any user resolve to the same document.
 */
export interface ClipDoc {
  id: 'clip'
  handle: string
  type: 'clip'
  key: string
  /** Normalized text that was synthesized, kept for debugging. */
  text: string
  voice: string
  style: string
  /** MP3 bytes, base64 (~7-15 KB for one word, against a 2 MB doc limit). */
  audio: string
  createdAt: number
}

export function clipPartition(key: string): string {
  return `clip#${key}`
}
