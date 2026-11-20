import { avatarObjectUrl, openMemberAvatar } from '@/features/crypto/publish-avatar'
import { heldWorkspaceKey } from '@/features/crypto/field-mirror'
import { peekSessionPrivateKey } from '@/features/crypto/session-private-key'
import { openPersonalDisplayName, sealPersonalDisplayName } from '@/lib/crypto/display-name'
import { decryptField, encryptField, type FieldCiphertext } from '@/lib/crypto/formats'
import { supabase } from '@/lib/supabase'

function fieldCiphertext(value: unknown): FieldCiphertext | null {
  if (!value || typeof value !== 'object') return null
  const record = value as FieldCiphertext
  if (record.v !== 1 || record.alg !== 'A256GCM' || !Number.isInteger(record.key_version)) return null
  return record
}

async function samePersonalName(userId: string, name: string) {
  const secret = peekSessionPrivateKey()
  if (!secret || secret.userId !== userId) return false
  const profile = await supabase.from('user_crypto_profiles').select('display_name_ciphertext').maybeSingle()
  if (profile.error) throw profile.error
  const sealed = fieldCiphertext(profile.data?.display_name_ciphertext)
  if (!sealed) return false
  try {
    return (await openPersonalDisplayName(userId, sealed, secret.privateKey)) === name
  } catch {
    return false
  }
}

async function sealPersonal(userId: string, name: string | null, onlyMissing: boolean) {
  const secret = peekSessionPrivateKey()
  if (!secret || secret.userId !== userId) return
  if (name && onlyMissing && (await samePersonalName(userId, name))) return
  const ciphertext = name ? await sealPersonalDisplayName(userId, name, secret.privateKey) : null
  const saved = await supabase.from('user_crypto_profiles').update({ display_name_ciphertext: ciphertext }).eq('user_id', userId)
  if (saved.error) throw saved.error
}

async function sealMemberships(userId: string, name: string | null, onlyMissing: boolean) {
  const members = await supabase.from('workspace_members').select('id, workspace_id, display_name_ciphertext').eq('user_id', userId)
  if (members.error) throw members.error
  const workspaces = await supabase
    .from('workspaces')
    .select('id, current_key_version')
    .in('encryption_status', ['dual', 'ciphertext_only'])
  if (workspaces.error) throw workspaces.error
  const versions = new Map((workspaces.data ?? []).map((row) => [row.id as string, row.current_key_version as number | null]))
  for (const member of members.data ?? []) {
    const workspaceId = member.workspace_id as string
    const keyVersion = versions.get(workspaceId)
    const held = heldWorkspaceKey(workspaceId)
    if (!held || typeof keyVersion !== 'number' || held.keyVersion !== keyVersion) continue
    const recordId = member.id as string
    const aad = { workspaceId, table: 'workspace_members', recordId, field: 'display_name', keyVersion }
    const existing = fieldCiphertext(member.display_name_ciphertext)
    if (name && onlyMissing && existing?.key_version === keyVersion) {
      try {
        if ((await decryptField(existing, held.key, aad)) === name) continue
      } catch {
        // The stored copy does not open. Write a new one.
      }
    }
    const ciphertext = name ? await encryptField(name, held.key, aad) : null
    if (ciphertext) {
      const opened = await decryptField(ciphertext, held.key, aad)
      if (opened !== name) throw new Error('Encrypted copy did not match the saved text.')
    }
    const saved = await supabase.rpc('set_member_display_name', {
      p_member_id: recordId,
      p_ciphertext: ciphertext,
    })
    if (saved.error) throw saved.error
  }
}

export async function loadOwnDisplayName(userId: string) {
  const secret = peekSessionPrivateKey()
  if (secret?.userId === userId) {
    const profile = await supabase.from('user_crypto_profiles').select('display_name_ciphertext').maybeSingle()
    if (profile.error) throw profile.error
    const sealed = fieldCiphertext(profile.data?.display_name_ciphertext)
    if (sealed) {
      try {
        return await openPersonalDisplayName(userId, sealed, secret.privateKey)
      } catch {
        // A workspace copy can still open with a key this session already holds.
      }
    }
  }
  const members = await supabase.from('workspace_members').select('id, workspace_id, display_name_ciphertext').eq('user_id', userId)
  if (members.error) throw members.error
  for (const member of members.data ?? []) {
    const workspaceId = member.workspace_id as string
    const sealed = fieldCiphertext(member.display_name_ciphertext)
    const held = heldWorkspaceKey(workspaceId)
    if (!sealed || !held || held.keyVersion !== sealed.key_version) continue
    try {
      return await decryptField(sealed, held.key, {
        workspaceId,
        table: 'workspace_members',
        recordId: String(member.id),
        field: 'display_name',
        keyVersion: held.keyVersion,
      })
    } catch {
      // Try the next workspace this person belongs to.
    }
  }
  return ''
}

export async function publishDisplayName(userId: string, name: string, onlyMissing = false) {
  const trimmed = name.trim()
  const value = trimmed.length > 0 ? trimmed : null
  await sealPersonal(userId, value, onlyMissing)
  await sealMemberships(userId, value, onlyMissing)
}

export async function revealMemberName<T extends { id: string; full_name: string | null; avatar_url?: string | null }>(
  workspaceId: string,
  person: T & { display_name_ciphertext?: unknown; avatar_ciphertext?: unknown },
): Promise<T> {
  const { display_name_ciphertext, avatar_ciphertext, ...rest } = person
  const sealed = fieldCiphertext(display_name_ciphertext)
  const held = heldWorkspaceKey(workspaceId)
  let full_name = rest.full_name
  if (sealed && held && held.keyVersion === sealed.key_version) {
    try {
      full_name = await decryptField(sealed, held.key, {
        workspaceId,
        table: 'workspace_members',
        recordId: person.id,
        field: 'display_name',
        keyVersion: held.keyVersion,
      })
    } catch {
      // The account name stays hidden. The workspace copy did not open.
    }
  }
  const packed = await openMemberAvatar(workspaceId, person.id, avatar_ciphertext)
  const avatar_url = packed ? avatarObjectUrl(packed) : rest.avatar_url
  return { ...rest, full_name, avatar_url } as T
}
