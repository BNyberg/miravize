import { verifyCurrentPassword } from '@/features/auth/verify-password'
import { holdWorkspaceKey, sealFields, SENSITIVE_COLUMNS, type SensitiveTable } from '@/features/crypto/field-mirror'
import { unlockPrivateKeyWithPassword, type PasswordWrappedPrivateKey } from '@/lib/crypto/account-keys'
import { base64UrlToBytes, zeroBytes } from '@/lib/crypto/bytes'
import { CryptoError } from '@/lib/crypto/errors'
import { decryptField, encryptField, type FieldCiphertext } from '@/lib/crypto/formats'
import { createWorkspaceKey, openWorkspaceKey, sealWorkspaceKey } from '@/lib/crypto/workspace-keys'
import { shareWorkspaceKey } from '@/features/crypto/share-workspace-key'
import { supabase } from '@/lib/supabase'

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

function fieldCiphertext(value: unknown): FieldCiphertext | null {
  if (!value || typeof value !== 'object') return null
  const record = value as FieldCiphertext
  if (record.v !== 1 || record.alg !== 'A256GCM' || !Number.isInteger(record.key_version)) return null
  return record
}

async function rowsOf(table: string, workspaceId: string, columns: string[]) {
  const rows: Record<string, unknown>[] = []
  const page = 500
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from(table)
      .select(['id', ...columns].join(','))
      .eq('workspace_id', workspaceId)
      .range(from, from + page - 1)
    if (error) throw error
    const batch = (data ?? []) as unknown as Record<string, unknown>[]
    rows.push(...batch)
    if (batch.length < page) break
  }
  return rows
}

async function rewriteFields(
  table: SensitiveTable,
  row: Record<string, unknown>,
  workspaceId: string,
  currentVersion: number,
  nextVersion: number,
  currentKey: Uint8Array,
  nextKey: Uint8Array,
) {
  const columns = SENSITIVE_COLUMNS[table] as Record<string, string>
  const pending: Record<string, string | null> = {}
  for (const [field, column] of Object.entries(columns)) {
    const sealed = fieldCiphertext(row[column])
    if (!sealed) continue
    if (sealed.key_version === nextVersion) {
      await decryptField(sealed, nextKey, { workspaceId, table, recordId: String(row.id), field, keyVersion: nextVersion })
      continue
    }
    if (sealed.key_version !== currentVersion) {
      throw new Error('An encrypted field is on an unexpected key. Nothing further was switched over.')
    }
    pending[field] = await decryptField(sealed, currentKey, {
      workspaceId,
      table,
      recordId: String(row.id),
      field,
      keyVersion: currentVersion,
    })
  }
  if (Object.keys(pending).length === 0) return
  await sealFields(table, String(row.id), pending, nextKey, workspaceId, nextVersion)
}

async function rewriteMemberField(
  workspaceId: string,
  currentVersion: number,
  nextVersion: number,
  currentKey: Uint8Array,
  nextKey: Uint8Array,
  column: 'display_name_ciphertext' | 'avatar_ciphertext',
  field: 'display_name' | 'avatar',
  rpc: 'set_member_display_name' | 'set_member_avatar',
) {
  const members = await supabase.from('workspace_members').select(`id, ${column}`).eq('workspace_id', workspaceId)
  if (members.error) throw members.error
  for (const member of members.data ?? []) {
    const sealed = fieldCiphertext(member[column])
    if (!sealed) continue
    const recordId = String(member.id)
    const currentAad = { workspaceId, table: 'workspace_members', recordId, field, keyVersion: currentVersion }
    const nextAad = { ...currentAad, keyVersion: nextVersion }
    if (sealed.key_version === nextVersion) {
      await decryptField(sealed, nextKey, nextAad)
      continue
    }
    if (sealed.key_version !== currentVersion) {
      throw new Error('An encrypted field is on an unexpected key. Nothing further was switched over.')
    }
    const plain = await decryptField(sealed, currentKey, currentAad)
    const encrypted = await encryptField(plain, nextKey, nextAad)
    const opened = await decryptField(encrypted, nextKey, nextAad)
    if (opened !== plain) throw new Error('Encrypted copy did not match the saved text.')
    const saved = await supabase.rpc(rpc, { p_member_id: recordId, p_ciphertext: encrypted })
    if (saved.error) throw saved.error
  }
}

async function rewriteAuditEvents(
  workspaceId: string,
  currentVersion: number,
  nextVersion: number,
  currentKey: Uint8Array,
  nextKey: Uint8Array,
) {
  const events = await supabase.from('audit_events').select('id, detail_ciphertext').eq('workspace_id', workspaceId)
  if (events.error) throw events.error
  for (const event of events.data ?? []) {
    const sealed = fieldCiphertext(event.detail_ciphertext)
    if (!sealed) continue
    const recordId = String(event.id)
    const currentAad = { workspaceId, table: 'audit_events', recordId, field: 'detail', keyVersion: currentVersion }
    const nextAad = { ...currentAad, keyVersion: nextVersion }
    if (sealed.key_version === nextVersion) {
      await decryptField(sealed, nextKey, nextAad)
      continue
    }
    if (sealed.key_version !== currentVersion) {
      throw new Error('An encrypted field is on an unexpected key. Nothing further was switched over.')
    }
    const plain = await decryptField(sealed, currentKey, currentAad)
    const encrypted = await encryptField(plain, nextKey, nextAad)
    const opened = await decryptField(encrypted, nextKey, nextAad)
    if (opened !== plain) throw new Error('Encrypted copy did not match the saved text.')
    const saved = await supabase.rpc('set_audit_event_detail', { p_event_id: recordId, p_ciphertext: encrypted })
    if (saved.error) throw saved.error
  }
}

export async function rotateWorkspaceKey(
  email: string,
  password: string,
  workspaceId: string,
  excludeUserIds: string[] = [],
) {
  await verifyCurrentPassword(email, password)
  const user = await supabase.auth.getUser()
  const userId = user.data.user?.id
  if (!userId) throw new Error('Not signed in')
  const profile = await supabase
    .from('user_crypto_profiles')
    .select('public_key, public_key_fingerprint, encrypted_private_key, crypto_status')
    .maybeSingle()
  if (profile.error) throw profile.error
  if (profile.data?.crypto_status !== 'ready') throw new Error('Set up your encryption key before rotating a workspace key.')
  const workspace = await supabase
    .from('workspaces')
    .select('id, encryption_status, current_key_version, key_rotation_status, name_ciphertext')
    .eq('id', workspaceId)
    .maybeSingle()
  if (workspace.error) throw workspace.error
  if (!workspace.data) throw new Error('Workspace was not found.')
  const status = workspace.data.encryption_status as string
  const currentVersion = workspace.data.current_key_version as number | null
  if ((status !== 'dual' && status !== 'ciphertext_only') || typeof currentVersion !== 'number') {
    throw new Error('This workspace has no encryption key to rotate.')
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

  let currentKey: Uint8Array | null = null
  let nextKey: Uint8Array | null = null
  try {
    const started = await supabase.rpc('begin_workspace_key_rotation', { p_workspace_id: workspaceId })
    if (started.error) throw started.error
    const publicKey = base64UrlToBytes(profile.data.public_key as string)
    const envelopes = await supabase
      .from('workspace_member_key_envelopes')
      .select('key_version, sealed_workspace_key')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
    if (envelopes.error) throw envelopes.error
    const rows = envelopes.data ?? []
    const currentEnvelope = rows.find((row) => row.key_version === currentVersion)
    if (!currentEnvelope?.sealed_workspace_key) throw new Error('The current workspace key was not found.')
    currentKey = await openWorkspaceKey(currentEnvelope.sealed_workspace_key as string, publicKey, privateKey)
    const pending = rows
      .filter((row) => typeof row.key_version === 'number' && row.key_version > currentVersion)
      .sort((left, right) => (right.key_version as number) - (left.key_version as number))[0]
    const nextVersion = (pending?.key_version as number | undefined) ?? currentVersion + 1
    if (pending?.sealed_workspace_key) {
      nextKey = await openWorkspaceKey(pending.sealed_workspace_key as string, publicKey, privateKey)
    } else {
      nextKey = await createWorkspaceKey()
      const sealed = await sealWorkspaceKey(nextKey, publicKey)
      const inserted = await supabase.from('workspace_member_key_envelopes').insert({
        workspace_id: workspaceId,
        user_id: userId,
        key_version: nextVersion,
        recipient_public_key_fingerprint: profile.data.public_key_fingerprint,
        sealed_workspace_key: sealed,
      })
      if (inserted.error) throw inserted.error
    }

    await rewriteFields(
      'workspaces',
      { id: workspaceId, name_ciphertext: workspace.data.name_ciphertext },
      workspaceId,
      currentVersion,
      nextVersion,
      currentKey,
      nextKey,
    )
    for (const spec of TABLES) {
      const columns = Object.values(SENSITIVE_COLUMNS[spec.table])
      const records = await rowsOf(spec.table, workspaceId, columns)
      for (const record of records) {
        await rewriteFields(spec.table, record, workspaceId, currentVersion, nextVersion, currentKey, nextKey)
      }
    }

    await rewriteAuditEvents(workspaceId, currentVersion, nextVersion, currentKey, nextKey)
    await rewriteMemberField(workspaceId, currentVersion, nextVersion, currentKey, nextKey, 'display_name_ciphertext', 'display_name', 'set_member_display_name')
    await rewriteMemberField(workspaceId, currentVersion, nextVersion, currentKey, nextKey, 'avatar_ciphertext', 'avatar', 'set_member_avatar')
    await shareWorkspaceKey(workspaceId, nextVersion, nextKey, excludeUserIds)
    const committed = await supabase.rpc('commit_workspace_key_rotation', {
      p_workspace_id: workspaceId,
      p_key_version: nextVersion,
    })
    if (committed.error) throw committed.error
    holdWorkspaceKey(workspaceId, nextVersion, nextKey)
    nextKey = null
  } finally {
    zeroBytes(privateKey)
    if (currentKey) zeroBytes(currentKey)
    if (nextKey) zeroBytes(nextKey)
  }
}
