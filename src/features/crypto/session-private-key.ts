import { zeroBytes } from '@/lib/crypto/bytes'

type SessionPrivateKey = {
  userId: string
  privateKey: Uint8Array
  publicKey: Uint8Array
}

let secret: SessionPrivateKey | null = null

export function holdSessionPrivateKey(userId: string, privateKey: Uint8Array, publicKey: Uint8Array) {
  const next = {
    userId,
    privateKey: privateKey.slice(),
    publicKey: publicKey.slice(),
  }
  clearSessionPrivateKey()
  secret = next
}

export function peekSessionPrivateKey() {
  return secret
}

export function clearSessionPrivateKey() {
  if (!secret) return
  zeroBytes(secret.privateKey)
  zeroBytes(secret.publicKey)
  secret = null
}

export type EnvelopePresence = 'unknown' | 'absent' | 'present'

const presence = new Map<string, EnvelopePresence>()
const listeners = new Set<() => void>()
let snapshot = ''

function emitPresence() {
  snapshot = [...presence.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, state]) => `${id}:${state}`)
    .join('|')
  for (const listener of listeners) listener()
}

export function envelopePresence(workspaceId: string): EnvelopePresence {
  return presence.get(workspaceId) ?? 'unknown'
}

export function subscribeEnvelopePresence(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function envelopePresenceSnapshot() {
  return snapshot
}

export function clearEnvelopePresence() {
  if (presence.size === 0) return
  presence.clear()
  emitPresence()
}

export function replaceEnvelopePresence(next: Map<string, EnvelopePresence>) {
  presence.clear()
  for (const [id, state] of next) presence.set(id, state)
  emitPresence()
}
