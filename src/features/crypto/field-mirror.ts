import { toast } from '@/components/ui/toast'
import { decryptField, encryptField, type FieldCiphertext } from '@/lib/crypto/formats'
import { supabase } from '@/lib/supabase'
import { base64UrlToBytes, bytesToBase64Url, zeroBytes } from '@/lib/crypto/bytes'

export const SENSITIVE_COLUMNS = {
  workspaces: { name: 'name_ciphertext' },
  clients: { name: 'name_ciphertext' },
  projects: { name: 'name_ciphertext', description: 'description_ciphertext' },
  activities: { name: 'name_ciphertext' },
  tags: { name: 'name_ciphertext' },
  project_aliases: { shortcut: 'shortcut_ciphertext' },
  time_entries: { description: 'description_ciphertext' },
  requests: {
    requester: 'requester_ciphertext',
    request: 'request_ciphertext',
    additional_notes: 'additional_notes_ciphertext',
    website: 'website_ciphertext',
  },
  tasks: {
    requester: 'requester_ciphertext',
    task: 'task_ciphertext',
    additional_notes: 'additional_notes_ciphertext',
    website: 'website_ciphertext',
  },
} as const

export type SensitiveTable = keyof typeof SENSITIVE_COLUMNS

type SessionKey = {
  workspaceId: string
  keyVersion: number
  key: Uint8Array
}

const SESSION_KEY_STORAGE = 'miravize-session-keys'
const sessions = new Map<string, SessionKey>()
const readSource = new Map<string, 'encrypted' | 'original' | 'locked'>()
const readListeners = new Set<() => void>()
let storeUserId: string | null = null

function emitRead() {
  for (const listener of readListeners) listener()
}

function persistSessionKeys() {
  if (!storeUserId) return
  const keys = [...sessions.values()].map((session) => ({
    workspaceId: session.workspaceId,
    keyVersion: session.keyVersion,
    key: bytesToBase64Url(session.key),
  }))
  try {
    localStorage.setItem(SESSION_KEY_STORAGE, JSON.stringify({ userId: storeUserId, keys }))
  } catch {
    // A private window can refuse storage. The keys still work until reload.
  }
}

function clearMemory() {
  for (const session of sessions.values()) zeroBytes(session.key)
  sessions.clear()
  readSource.clear()
  emitRead()
}

export function bindSessionKeys(userId: string) {
  if (storeUserId === userId) return
  clearMemory()
  storeUserId = userId
  try {
    const raw = localStorage.getItem(SESSION_KEY_STORAGE)
    if (!raw) return
    const parsed = JSON.parse(raw) as { userId?: string; keys?: { workspaceId?: string; keyVersion?: number; key?: string }[] }
    if (parsed.userId !== userId || !Array.isArray(parsed.keys)) {
      localStorage.removeItem(SESSION_KEY_STORAGE)
      return
    }
    for (const item of parsed.keys) {
      if (!item.workspaceId || !item.key || !item.keyVersion) continue
      const key = base64UrlToBytes(item.key)
      sessions.set(item.workspaceId, { workspaceId: item.workspaceId, keyVersion: item.keyVersion, key })
    }
    emitRead()
  } catch {
    localStorage.removeItem(SESSION_KEY_STORAGE)
  }
}

export function clearSessionKeys() {
  clearMemory()
  storeUserId = null
  try {
    localStorage.removeItem(SESSION_KEY_STORAGE)
  } catch {
    // Ignore a storage failure while signing out.
  }
}

export function holdWorkspaceKey(workspaceId: string, keyVersion: number, key: Uint8Array) {
  const previous = sessions.get(workspaceId)
  if (previous) zeroBytes(previous.key)
  sessions.set(workspaceId, { workspaceId, keyVersion, key })
  readSource.delete(workspaceId)
  persistSessionKeys()
  emitRead()
}

export function markReadSource(workspaceId: string, next: 'encrypted' | 'original' | 'locked') {
  const current = readSource.get(workspaceId)
  if (current === 'original' || current === 'locked') return
  if (current === next) return
  readSource.set(workspaceId, next)
  emitRead()
}

export function readMode(workspaceId: string): 'encrypted' | 'original' | 'locked' | 'checking' {
  if (!sessions.has(workspaceId)) return 'original'
  return readSource.get(workspaceId) ?? 'checking'
}

export function subscribeReadMode(listener: () => void) {
  readListeners.add(listener)
  return () => {
    readListeners.delete(listener)
  }
}

export function listHeldWorkspaceKeys() {
  return [...sessions.values()].map((session) => ({
    workspaceId: session.workspaceId,
    keyVersion: session.keyVersion,
    key: session.key,
  }))
}

export function heldWorkspaceKey(workspaceId: string) {
  const held = sessions.get(workspaceId)
  if (!held) return null
  return { workspaceId: held.workspaceId, keyVersion: held.keyVersion, key: held.key }
}

async function workspaceOf(table: SensitiveTable, recordId: string) {
  if (table === 'workspaces') return recordId
  const { data, error } = await supabase.from(table).select('workspace_id').eq('id', recordId).maybeSingle()
  if (error) throw error
  const workspaceId = data?.workspace_id
  return typeof workspaceId === 'string' ? workspaceId : null
}

export async function sealFields(
  table: SensitiveTable,
  recordId: string,
  fields: Record<string, string | null>,
  key: Uint8Array,
  workspaceId: string,
  keyVersion: number,
) {
  const columns = SENSITIVE_COLUMNS[table] as Record<string, string>
  const payload: Record<string, FieldCiphertext | null> = {}
  for (const [field, value] of Object.entries(fields)) {
    const column = columns[field]
    if (!column) throw new Error('Encrypted value is malformed')
    if (value == null) {
      payload[column] = null
      continue
    }
    const aad = { workspaceId, table, recordId, field, keyVersion }
    const encrypted = await encryptField(value, key, aad)
    const opened = await decryptField(encrypted, key, aad)
    if (opened !== value) throw new Error('Encrypted copy did not match the saved text.')
    payload[column] = encrypted
  }
  const { error } = await supabase.rpc('write_field_ciphertext', {
    p_table: table,
    p_record_id: recordId,
    p_fields: payload,
  })
  if (error) throw error
}

export function storedNote(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

export async function mirrorSensitive(table: SensitiveTable, recordId: string, fields: Record<string, string | null>) {
  try {
    const workspaceId = await workspaceOf(table, recordId)
    const held = workspaceId ? sessions.get(workspaceId) : null
    if (!held) return
    await sealFields(table, recordId, fields, held.key, held.workspaceId, held.keyVersion)
  } catch (error) {
    toast({
      tone: 'error',
      title: "Couldn't update the encrypted copy",
      description: error instanceof Error ? error.message : 'Try again.',
    })
  }
}
