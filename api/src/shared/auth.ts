import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { HttpRequest } from '@azure/functions'
import type { Container } from '@azure/cosmos'
import type { AccountDoc } from './cosmos'

export const HANDLE_RE = /^[a-z0-9][a-z0-9-]{2,19}$/

// The sync code has ~30 bits of entropy, so a leaked hash must be expensive
// to brute-force: salted scrypt, not a bare digest.
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 }

/** Salted scrypt of the sync code, stored as "<salt hex>:<hash hex>". */
export function hashSecret(secret: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(secret, salt, 32, SCRYPT_PARAMS)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifySecret(secret: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(secret, Buffer.from(saltHex, 'hex'), expected.length, SCRYPT_PARAMS)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

// No easily-confused characters (I/L/O/0/1).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/**
 * Sync code shown once to the user, e.g. "K7QM2X". Six chars ≈ 31^6 ≈ 890M
 * combinations: short enough to type on a phone, far too many to guess online.
 */
export function generateSecret(): string {
  return Array.from(randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join('')
}

export interface Credentials {
  handle: string
  secret: string
}

export function readCredentials(req: HttpRequest): Credentials | null {
  const handle = req.headers.get('x-cfc-handle')?.trim().toLowerCase()
  const secret = req.headers.get('x-cfc-secret')?.trim().toUpperCase()
  if (!handle || !secret || !HANDLE_RE.test(handle)) return null
  return { handle, secret }
}

export async function verifyCredentials(container: Container, creds: Credentials): Promise<boolean> {
  const { resource } = await container.item('account', creds.handle).read<AccountDoc>()
  if (!resource?.secretHash) return false
  return verifySecret(creds.secret, resource.secretHash)
}
