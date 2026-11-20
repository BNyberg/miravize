import { verifyCurrentPassword } from '@/features/auth/verify-password'
import { holdWorkspaceKey, sealFields, SENSITIVE_COLUMNS, type SensitiveTable } from '@/features/crypto/field-mirror'
import { holdSessionPrivateKey } from '@/features/crypto/session-private-key'
import { decryptField, type FieldCiphertext } from '@/lib/crypto/formats'
import { CryptoError } from '@/lib/crypto/errors'
import { unlockPrivateKeyWithPassword, unlockPrivateKeyWithRecovery, type PasswordWrappedPrivateKey, type RecoveryWrappedPrivateKey } from '@/lib/crypto/account-keys'
import { base64UrlToBytes, bytesEqual, zeroBytes } from '@/lib/crypto/bytes'
import { publicKeyFromPrivate } from '@/lib/crypto/primitives'
import { createWorkspaceKey, openWorkspaceKey, sealWorkspaceKey } from '@/lib/crypto/workspace-keys'
import { supabase } from '@/lib/supabase'

const KEY_VERSION = 1

type TextRow = { id: string } & Record<string, string | null>

const TABLES: { table: SensitiveTable; fields: string[] }[] = [
  { table: 'clients', fields: ['name'] },
  { table: 'projects', fields: ['name', 'description'] },
  { table: 'activities', fields: ['name'] },
  { table: 'tags', fields: ['name'] },
  { table: 'project_aliases', fields: ['shortcut'] },
  { table: 'time_entries', fields: ['description'] },
  { table: 'requests', fields: ['requester', 'request', 'additional_notes', 'website'] },
  { table: 'tasks', fields: ['requester', 'task', 'additional_notes', 'website'] },
]

async function rowsOf(table: string, workspaceId: string, fields: string[]) {
  const rows: TextRow[] = []
  const page = 500
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from(table)
      .select(['id', ...fields].join(','))
      .eq('workspace_id', workspaceId)
      .range(from, from + page - 1)
    if (error) throw error
    const batch = (data ?? []) as unknown as TextRow[]
    rows.push(...batch)
    if (batch.length < page) break
  }
  return rows
}

async function workspaceByCode(idCode: string) {
  const result = await supabase
    .from('workspaces')
    .select('id, name, encryption_status, current_key_version')
    .eq('id_code', idCode)
    .maybeSingle()
  if (result.error) throw result.error
  if (!result.data) throw new Error('Workspace was not found.')
  return result.data
}

export async function encryptWorkspace(email: string, password: string, idCode: string) {
  await verifyCurrentPassword(email, password)
  const profile = await supabase
    .from('user_crypto_profiles')
    .select('public_key, public_key_fingerprint, encrypted_private_key, crypto_status')
    .maybeSingle()
  if (profile.error) throw profile.error
  if (profile.data?.crypto_status !== 'ready') throw new Error('Set up your encryption key before encrypting a workspace.')

  const target = await workspaceByCode(idCode)
  if (target.encryption_status === 'ciphertext_only') {
    throw new Error(`${target.name} is already encrypted without a plaintext copy.`)
  }
  if (target.encryption_status === 'dual') {
    throw new Error(`${target.name} already has an encrypted copy.`)
  }

  const user = await supabase.auth.getUser()
  const userId = user.data.user?.id
  if (!userId) throw new Error('Not signed in')
  const privateKey = await unlockPrivateKeyWithPassword({
    userId,
    password,
    wrapped: profile.data.encrypted_private_key as PasswordWrappedPrivateKey,
  })
  let workspaceKey: Uint8Array | null = null
  try {
    const publicKey = base64UrlToBytes(profile.data.public_key as string)
    const existing = await supabase
      .from('workspace_member_key_envelopes')
      .select('sealed_workspace_key')
      .eq('workspace_id', target.id)
      .eq('user_id', userId)
      .eq('key_version', KEY_VERSION)
      .maybeSingle()
    if (existing.error) throw existing.error
    if (existing.data?.sealed_workspace_key) {
      workspaceKey = await openWorkspaceKey(existing.data.sealed_workspace_key as string, publicKey, privateKey)
    } else {
      workspaceKey = await createWorkspaceKey()
      const sealed = await sealWorkspaceKey(workspaceKey, publicKey)
      const inserted = await supabase.from('workspace_member_key_envelopes').insert({
        workspace_id: target.id,
        user_id: userId,
        key_version: KEY_VERSION,
        recipient_public_key_fingerprint: profile.data.public_key_fingerprint,
        sealed_workspace_key: sealed,
      })
      if (inserted.error) throw inserted.error
    }

    const workspace = await supabase.from('workspaces').select('id, name').eq('id', target.id).single()
    if (workspace.error) throw workspace.error
    await sealFields('workspaces', target.id, { name: workspace.data.name as string }, workspaceKey, target.id, KEY_VERSION)

    for (const spec of TABLES) {
      const records = await rowsOf(spec.table, target.id, spec.fields)
      for (const record of records) {
        const fields: Record<string, string | null> = {}
        for (const field of spec.fields) {
          const value = record[field]
          if (typeof value === 'string') fields[field] = value
        }
        if (Object.keys(fields).length === 0) continue
        await sealFields(spec.table, record.id, fields, workspaceKey, target.id, KEY_VERSION)
      }
    }

    const marked = await supabase.rpc('mark_workspace_dual', {
      p_workspace_id: target.id,
      p_key_version: KEY_VERSION,
    })
    if (marked.error) throw marked.error
    holdWorkspaceKey(target.id, KEY_VERSION, workspaceKey)
    workspaceKey = null
  } finally {
    zeroBytes(privateKey)
    if (workspaceKey) zeroBytes(workspaceKey)
  }
}

export async function unlockWorkspace(email: string, password: string, idCode: string) {
  await verifyCurrentPassword(email, password)
  const user = await supabase.auth.getUser()
  const userId = user.data.user?.id
  if (!userId) throw new Error('Not signed in')
  const profile = await supabase
    .from('user_crypto_profiles')
    .select('public_key, encrypted_private_key, crypto_status')
    .maybeSingle()
  if (profile.error) throw profile.error
  if (profile.data?.crypto_status !== 'ready') throw new Error('Set up your encryption key before unlocking a workspace.')
  const target = await workspaceByCode(idCode)
  if (target.encryption_status !== 'dual' && target.encryption_status !== 'ciphertext_only') {
    throw new Error(`${idCode} does not have an encrypted copy yet.`)
  }
  let privateKey: Uint8Array
  try {
    privateKey = await unlockPrivateKeyWithPassword({
      userId,
      password,
      wrapped: profile.data.encrypted_private_key as PasswordWrappedPrivateKey,
    })
  } catch (error) {
    if (error instanceof CryptoError && error.code === 'integrity') {
      throw new Error('That password does not open the saved encryption key.')
    }
    throw error
  }
  holdSessionPrivateKey(userId, privateKey, base64UrlToBytes(profile.data.public_key as string))
  try {
    const keyVersion = target.current_key_version
    if (typeof keyVersion !== 'number') throw new Error(`${idCode} has not been shared with you yet.`)
    const envelope = await supabase
      .from('workspace_member_key_envelopes')
      .select('sealed_workspace_key')
      .eq('workspace_id', target.id)
      .eq('user_id', userId)
      .eq('key_version', keyVersion)
      .maybeSingle()
    if (envelope.error) throw envelope.error
    if (!envelope.data?.sealed_workspace_key) throw new Error(`${idCode} has not been shared with you yet.`)
    const workspaceKey = await openWorkspaceKey(
      envelope.data.sealed_workspace_key as string,
      base64UrlToBytes(profile.data.public_key as string),
      privateKey,
    )
    holdWorkspaceKey(target.id, keyVersion, workspaceKey)
  } finally {
    zeroBytes(privateKey)
  }
}

export async function unlockWorkspacesWithPassword(email: string, password: string) {
  await verifyCurrentPassword(email, password)
  const user = await supabase.auth.getUser()
  const userId = user.data.user?.id
  if (!userId) throw new Error('Not signed in')
  const profile = await supabase
    .from('user_crypto_profiles')
    .select('public_key, encrypted_private_key, crypto_status')
    .maybeSingle()
  if (profile.error) throw profile.error
  if (profile.data?.crypto_status !== 'ready') return
  let privateKey: Uint8Array
  try {
    privateKey = await unlockPrivateKeyWithPassword({
      userId,
      password,
      wrapped: profile.data.encrypted_private_key as PasswordWrappedPrivateKey,
    })
  } catch (error) {
    if (error instanceof CryptoError && error.code === 'integrity') {
      throw new Error('That password does not open the saved encryption key.')
    }
    throw error
  }
  const stored = base64UrlToBytes(profile.data.public_key as string)
  holdSessionPrivateKey(userId, privateKey, stored)
  const opened: { workspaceId: string; keyVersion: number; key: Uint8Array }[] = []
  try {
    const workspaces = await supabase
      .from('workspaces')
      .select('id, current_key_version')
      .in('encryption_status', ['dual', 'ciphertext_only'])
    if (workspaces.error) throw workspaces.error
    const envelopes = await supabase
      .from('workspace_member_key_envelopes')
      .select('workspace_id, key_version, sealed_workspace_key')
      .eq('user_id', userId)
    if (envelopes.error) throw envelopes.error
    for (const workspace of workspaces.data ?? []) {
      const workspaceId = workspace.id as string
      const keyVersion = workspace.current_key_version as number | null
      const envelope = (envelopes.data ?? []).find(
        (row) => row.workspace_id === workspaceId && row.key_version === keyVersion,
      )
      if (!envelope?.sealed_workspace_key || typeof keyVersion !== 'number') continue
      const workspaceKey = await openWorkspaceKey(envelope.sealed_workspace_key as string, stored, privateKey)
      opened.push({ workspaceId, keyVersion, key: workspaceKey })
    }
    for (const item of opened) holdWorkspaceKey(item.workspaceId, item.keyVersion, item.key)
    opened.length = 0
  } finally {
    zeroBytes(privateKey)
    for (const item of opened) zeroBytes(item.key)
  }
}

export async function unlockWorkspacesWithRecovery(recoveryKey: string) {
  const user = await supabase.auth.getUser()
  const userId = user.data.user?.id
  if (!userId) throw new Error('Not signed in')
  const profile = await supabase
    .from('user_crypto_profiles')
    .select('public_key, recovery_wrapped_private_key, crypto_status')
    .maybeSingle()
  if (profile.error) throw profile.error
  if (profile.data?.crypto_status !== 'ready') throw new Error('Set up your encryption key before using a recovery key.')
  let privateKey: Uint8Array
  try {
    privateKey = await unlockPrivateKeyWithRecovery({
      userId,
      recoveryKey,
      wrapped: profile.data.recovery_wrapped_private_key as RecoveryWrappedPrivateKey,
    })
  } catch (error) {
    if (error instanceof CryptoError && error.code === 'integrity') {
      throw new Error('That recovery key does not open the saved encryption key.')
    }
    throw error
  }
  const opened: { workspaceId: string; keyVersion: number; key: Uint8Array }[] = []
  try {
    const derived = await publicKeyFromPrivate(privateKey)
    const stored = base64UrlToBytes(profile.data.public_key as string)
    if (!bytesEqual(derived, stored)) throw new Error('The recovery key did not open the saved encryption key.')
    holdSessionPrivateKey(userId, privateKey, stored)
    const workspaces = await supabase
      .from('workspaces')
      .select('id, current_key_version')
      .in('encryption_status', ['dual', 'ciphertext_only'])
    if (workspaces.error) throw workspaces.error
    const envelopes = await supabase
      .from('workspace_member_key_envelopes')
      .select('workspace_id, key_version, sealed_workspace_key')
      .eq('user_id', userId)
    if (envelopes.error) throw envelopes.error
    const listed = workspaces.data ?? []
    if (listed.length === 0) throw new Error('No workspace has an encrypted copy yet.')
    for (const workspace of listed) {
      const workspaceId = workspace.id as string
      const keyVersion = workspace.current_key_version as number | null
      const envelope = (envelopes.data ?? []).find(
        (row) => row.workspace_id === workspaceId && row.key_version === keyVersion,
      )
      if (!envelope?.sealed_workspace_key || typeof keyVersion !== 'number') continue
      const workspaceKey = await openWorkspaceKey(envelope.sealed_workspace_key as string, stored, privateKey)
      opened.push({ workspaceId, keyVersion, key: workspaceKey })
    }
    for (const item of opened) holdWorkspaceKey(item.workspaceId, item.keyVersion, item.key)
    opened.length = 0
  } finally {
    zeroBytes(privateKey)
    for (const item of opened) zeroBytes(item.key)
  }
}

function fieldCiphertext(value: unknown): FieldCiphertext | null {
  if (!value || typeof value !== 'object') return null
  const record = value as FieldCiphertext
  if (record.v !== 1 || record.alg !== 'A256GCM') return null
  return record
}

export async function cutoverWorkspace(email: string, password: string, idCode: string) {
  if (idCode !== 'P' && idCode !== 'MV' && idCode !== 'TD') throw new Error('This workspace is not ready to drop its original text.')
  await verifyCurrentPassword(email, password)
  const user = await supabase.auth.getUser()
  const userId = user.data.user?.id
  if (!userId) throw new Error('Not signed in')
  const profile = await supabase
    .from('user_crypto_profiles')
    .select('public_key, encrypted_private_key, crypto_status')
    .maybeSingle()
  if (profile.error) throw profile.error
  if (profile.data?.crypto_status !== 'ready') throw new Error('Set up your encryption key before removing original text.')
  const target = await workspaceByCode(idCode)
  if (target.encryption_status !== 'dual') throw new Error(`${idCode} is not ready to remove its original text.`)
  let privateKey: Uint8Array
  try {
    privateKey = await unlockPrivateKeyWithPassword({
      userId,
      password,
      wrapped: profile.data.encrypted_private_key as PasswordWrappedPrivateKey,
    })
  } catch (error) {
    if (error instanceof CryptoError && error.code === 'integrity') {
      throw new Error('That password does not open the saved encryption key.')
    }
    throw error
  }
  let workspaceKey: Uint8Array | null = null
  try {
    const envelope = await supabase
      .from('workspace_member_key_envelopes')
      .select('sealed_workspace_key')
      .eq('workspace_id', target.id)
      .eq('user_id', userId)
      .eq('key_version', KEY_VERSION)
      .maybeSingle()
    if (envelope.error) throw envelope.error
    if (!envelope.data?.sealed_workspace_key) throw new Error(`${idCode} encryption key was not found.`)
    workspaceKey = await openWorkspaceKey(
      envelope.data.sealed_workspace_key as string,
      base64UrlToBytes(profile.data.public_key as string),
      privateKey,
    )
    const workspaceRow = await supabase.from('workspaces').select('id, name, name_ciphertext').eq('id', target.id).single()
    if (workspaceRow.error) throw workspaceRow.error
    await proveRow(idCode, 'workspaces', workspaceRow.data as Record<string, unknown>, ['name'], workspaceKey, target.id)
    for (const spec of TABLES) {
      const columns = SENSITIVE_COLUMNS[spec.table] as Record<string, string>
      const rows = await rowsOf(spec.table, target.id, [...spec.fields, ...spec.fields.map((field) => columns[field])])
      for (const row of rows) await proveRow(idCode, spec.table, row, spec.fields, workspaceKey, target.id)
    }
    const cut = await supabase.rpc('cutover_workspace_plaintext', { p_workspace_id: target.id })
    if (cut.error) throw cut.error
    holdWorkspaceKey(target.id, KEY_VERSION, workspaceKey)
    workspaceKey = null
  } finally {
    zeroBytes(privateKey)
    if (workspaceKey) zeroBytes(workspaceKey)
  }
}

async function proveRow(
  idCode: string,
  table: SensitiveTable,
  row: Record<string, unknown>,
  fields: string[],
  key: Uint8Array,
  workspaceId: string,
) {
  const columns = SENSITIVE_COLUMNS[table] as Record<string, string>
  for (const field of fields) {
    const value = row[field]
    const plain = typeof value === 'string' ? value : ''
    const sealed = fieldCiphertext(row[columns[field]])
    if (!sealed) {
      if (plain.length > 0) throw new Error(`${idCode} ${table} is missing an encrypted copy. Original text was not removed.`)
      continue
    }
    let opened: string
    try {
      opened = await decryptField(sealed, key, {
        workspaceId,
        table,
        recordId: String(row.id),
        field,
        keyVersion: KEY_VERSION,
      })
    } catch {
      throw new Error(`${idCode} ${table} did not decrypt. Original text was not removed.`)
    }
    if (opened !== plain) throw new Error(`${idCode} ${table} does not match its encrypted copy. Original text was not removed.`)
  }
}
