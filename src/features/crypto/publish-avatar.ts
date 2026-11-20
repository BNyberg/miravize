import { heldWorkspaceKey } from '@/features/crypto/field-mirror'
import { peekSessionPrivateKey } from '@/features/crypto/session-private-key'
import { openPersonalAvatar, packAvatar, sealPersonalAvatar, unpackAvatar } from '@/lib/crypto/avatar'
import { decryptField, encryptField, type FieldCiphertext } from '@/lib/crypto/formats'
import { supabase } from '@/lib/supabase'

const objectUrls = new Map<string, string>()

function fieldCiphertext(value: unknown): FieldCiphertext | null {
  if (!value || typeof value !== 'object') return null
  const record = value as FieldCiphertext
  if (record.v !== 1 || record.alg !== 'A256GCM' || !Number.isInteger(record.key_version)) return null
  return record
}

export function avatarObjectUrl(packed: string) {
  const existing = objectUrls.get(packed)
  if (existing) return existing
  const { mime, bytes } = unpackAvatar(packed)
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }))
  objectUrls.set(packed, url)
  return url
}

export function clearAvatarObjectUrls() {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url)
  objectUrls.clear()
}

async function packedFromBlob(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > 100_000) throw new Error('That picture is too large.')
  const mime = blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp'
  return packAvatar(bytes, mime)
}

async function samePersonalAvatar(userId: string, packed: string) {
  const secret = peekSessionPrivateKey()
  if (!secret || secret.userId !== userId) return false
  const profile = await supabase.from('user_crypto_profiles').select('avatar_ciphertext').maybeSingle()
  if (profile.error) throw profile.error
  const sealed = fieldCiphertext(profile.data?.avatar_ciphertext)
  if (!sealed) return false
  try {
    return (await openPersonalAvatar(userId, sealed, secret.privateKey)) === packed
  } catch {
    return false
  }
}

async function sealPersonal(userId: string, packed: string | null, onlyMissing: boolean) {
  const secret = peekSessionPrivateKey()
  if (!secret || secret.userId !== userId) return
  if (packed && onlyMissing && (await samePersonalAvatar(userId, packed))) return
  const ciphertext = packed ? await sealPersonalAvatar(userId, packed, secret.privateKey) : null
  const saved = await supabase.from('user_crypto_profiles').update({ avatar_ciphertext: ciphertext }).eq('user_id', userId)
  if (saved.error) throw saved.error
}

async function sealMemberships(userId: string, packed: string | null, onlyMissing: boolean) {
  const members = await supabase.from('workspace_members').select('id, workspace_id, avatar_ciphertext').eq('user_id', userId)
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
    const aad = { workspaceId, table: 'workspace_members', recordId, field: 'avatar', keyVersion }
    const existing = fieldCiphertext(member.avatar_ciphertext)
    if (packed && onlyMissing && existing?.key_version === keyVersion) {
      try {
        if ((await decryptField(existing, held.key, aad)) === packed) continue
      } catch {
        // The stored copy does not open. Write a new one.
      }
    }
    const ciphertext = packed ? await encryptField(packed, held.key, aad) : null
    if (ciphertext && packed) {
      const opened = await decryptField(ciphertext, held.key, aad)
      if (opened !== packed) throw new Error('Encrypted copy did not match the saved picture.')
    }
    const saved = await supabase.rpc('set_member_avatar', { p_member_id: recordId, p_ciphertext: ciphertext })
    if (saved.error) throw saved.error
  }
}

export async function publishAvatar(userId: string, blob: Blob) {
  const packed = await packedFromBlob(blob)
  await sealPersonal(userId, packed, false)
  await sealMemberships(userId, packed, false)
}

export async function loadOwnAvatar(userId: string) {
  const secret = peekSessionPrivateKey()
  if (secret?.userId === userId) {
    const profile = await supabase.from('user_crypto_profiles').select('avatar_ciphertext').maybeSingle()
    if (profile.error) throw profile.error
    const sealed = fieldCiphertext(profile.data?.avatar_ciphertext)
    if (sealed) {
      try {
        return await openPersonalAvatar(userId, sealed, secret.privateKey)
      } catch {
        // A workspace copy can still open with a key this session already holds.
      }
    }
  }
  const members = await supabase.from('workspace_members').select('id, workspace_id, avatar_ciphertext').eq('user_id', userId)
  if (members.error) throw members.error
  for (const member of members.data ?? []) {
    const workspaceId = member.workspace_id as string
    const sealed = fieldCiphertext(member.avatar_ciphertext)
    const held = heldWorkspaceKey(workspaceId)
    if (!sealed || !held || held.keyVersion !== sealed.key_version) continue
    try {
      return await decryptField(sealed, held.key, {
        workspaceId,
        table: 'workspace_members',
        recordId: String(member.id),
        field: 'avatar',
        keyVersion: held.keyVersion,
      })
    } catch {
      // Try the next workspace this person belongs to.
    }
  }
  return ''
}

export async function copyOwnAvatar(userId: string) {
  const packed = await loadOwnAvatar(userId)
  if (!packed) return
  await sealMemberships(userId, packed, true)
}

async function downloadStoredAvatar(userId: string) {
  for (const path of [`${userId}/avatar.webp`, `${userId}/avatar.jpg`]) {
    const file = await supabase.storage.from('avatars').download(path)
    if (!file.error && file.data.size > 0) return file.data
  }
  return null
}

async function retirePublicAvatar(userId: string) {
  await supabase.storage.from('avatars').remove([`${userId}/avatar.webp`, `${userId}/avatar.jpg`])
  const cleared = await supabase.rpc('clear_own_avatar_url')
  if (cleared.error) throw cleared.error
}

export async function migrateStoredAvatar(userId: string) {
  const user = await supabase.auth.getUser()
  const metadata = user.data.user?.user_metadata
  const publicUrl = metadata && typeof metadata.avatar_url === 'string' ? metadata.avatar_url : ''
  const existing = await loadOwnAvatar(userId)
  if (existing) {
    if (publicUrl) await retirePublicAvatar(userId)
    return
  }
  const blob = await downloadStoredAvatar(userId)
  if (!blob) return
  await publishAvatar(userId, blob)
  await retirePublicAvatar(userId)
}

export async function openMemberAvatar(workspaceId: string, memberId: string, value: unknown) {
  const sealed = fieldCiphertext(value)
  const held = heldWorkspaceKey(workspaceId)
  if (!sealed || !held || held.keyVersion !== sealed.key_version) return ''
  try {
    return await decryptField(sealed, held.key, {
      workspaceId,
      table: 'workspace_members',
      recordId: memberId,
      field: 'avatar',
      keyVersion: held.keyVersion,
    })
  } catch {
    return ''
  }
}
