import { decryptField, type FieldCiphertext } from '@/lib/crypto/formats'
import { supabase } from '@/lib/supabase'

import { heldWorkspaceKey, markReadSource, SENSITIVE_COLUMNS, type SensitiveTable } from './field-mirror'

type Row = Record<string, unknown>

const NESTED: Record<string, SensitiveTable> = {
  workspace: 'workspaces',
  project: 'projects',
  activity: 'activities',
  client: 'clients',
  request: 'requests',
  task: 'tasks',
}

let sealedIds: Map<string, 'dual' | 'ciphertext_only'> | null = null

export function forgetDualWorkspaces() {
  sealedIds = null
}

async function sealedWorkspaces() {
  if (sealedIds) return sealedIds
  const { data, error } = await supabase
    .from('workspaces')
    .select('id, encryption_status')
    .in('encryption_status', ['dual', 'ciphertext_only'])
  if (error) throw error
  sealedIds = new Map(
    (data ?? []).map((row) => [String(row.id), row.encryption_status as 'dual' | 'ciphertext_only']),
  )
  return sealedIds
}

function ciphertext(value: unknown): FieldCiphertext | null {
  if (!value || typeof value !== 'object') return null
  const record = value as FieldCiphertext
  if (record.v !== 1 || record.alg !== 'A256GCM') return null
  return record
}

function maskLocked(table: SensitiveTable, row: Row) {
  const next: Row = { ...row }
  const columns = SENSITIVE_COLUMNS[table] as Record<string, string>
  for (const field of Object.keys(columns)) {
    if (!(field in row)) continue
    if (table === 'workspaces' && field === 'name' && typeof row.id_code === 'string' && row.id_code) {
      next.name = row.id_code
      continue
    }
    next[field] = ''
  }
  return next
}

async function revealFields(table: SensitiveTable, row: Row, sealed: Map<string, 'dual' | 'ciphertext_only'>) {
  const workspaceId = table === 'workspaces' ? String(row.id ?? '') : String(row.workspace_id ?? '')
  const status = workspaceId ? sealed.get(workspaceId) : undefined
  if (!workspaceId || !status) return row
  const held = heldWorkspaceKey(workspaceId)
  if (!held || held.workspaceId !== workspaceId) {
    markReadSource(workspaceId, status === 'ciphertext_only' ? 'locked' : 'original')
    return status === 'ciphertext_only' ? maskLocked(table, row) : row
  }
  const columns = SENSITIVE_COLUMNS[table] as Record<string, string>
  const next: Row = { ...row }
  let failed = false
  let opened = 0
  for (const [field, column] of Object.entries(columns)) {
    if (!(column in row)) continue
    const plain = row[field]
    const sealedField = ciphertext(row[column])
    if (!sealedField) {
      if (status === 'dual' && typeof plain === 'string' && plain.length > 0) failed = true
      if (status === 'ciphertext_only' && typeof plain === 'string' && plain.length > 0) failed = true
      continue
    }
    try {
      next[field] = await decryptField(sealedField, held.key, {
        workspaceId,
        table,
        recordId: String(row.id),
        field,
        keyVersion: held.keyVersion,
      })
      opened += 1
    } catch {
      failed = true
    }
  }
  if (!failed && opened > 0) markReadSource(workspaceId, 'encrypted')
  return next
}

async function revealRecord(table: SensitiveTable | null, row: Row, sealed: Map<string, 'dual' | 'ciphertext_only'>): Promise<Row> {
  const next = table ? await revealFields(table, row, sealed) : { ...row }
  for (const [key, nested] of Object.entries(NESTED)) {
    const value = next[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      next[key] = await revealRecord(nested, value as Row, sealed)
    }
  }
  for (const [key, value] of Object.entries(next)) {
    if (!Array.isArray(value)) continue
    next[key] = await Promise.all(value.map(async (item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item
      let copy = item as Row
      for (const [childKey, childTable] of Object.entries(NESTED)) {
        const child = copy[childKey]
        if (child && typeof child === 'object' && !Array.isArray(child)) {
          copy = { ...copy, [childKey]: await revealRecord(childTable, child as Row, sealed) }
        }
      }
      return copy
    }))
  }
  return next
}

export async function revealList<T>(table: SensitiveTable | null, rows: T[]): Promise<T[]> {
  const sealed = await sealedWorkspaces()
  const revealed: T[] = []
  for (const row of rows) {
    revealed.push(await revealRecord(table, row as Row, sealed) as T)
  }
  return revealed
}

export async function revealOne<T>(table: SensitiveTable | null, row: T | null): Promise<T | null> {
  if (!row) return null
  const [revealed] = await revealList(table, [row])
  return revealed ?? null
}
