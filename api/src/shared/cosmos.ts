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
