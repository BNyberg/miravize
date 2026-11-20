import { holdWorkspaceKey, sealFields } from '@/features/crypto/field-mirror'
import { copyOwnAvatar } from '@/features/crypto/publish-avatar'
import { loadOwnDisplayName, publishDisplayName } from '@/features/crypto/publish-display-name'
import { forgetDualWorkspaces } from '@/features/crypto/read-copy'
import { base64UrlToBytes, zeroBytes } from '@/lib/crypto/bytes'
import { createWorkspaceKey, sealWorkspaceKey } from '@/lib/crypto/workspace-keys'
import { supabase } from '@/lib/supabase'

const KEY_VERSION = 1

export async function sealCreatedWorkspace(workspaceId: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Name is required')
  const user = await supabase.auth.getUser()
  const userId = user.data.user?.id
  if (!userId) throw new Error('Not signed in')
  const profile = await supabase
    .from('user_crypto_profiles')
    .select('public_key, public_key_fingerprint, crypto_status')
    .maybeSingle()
  if (profile.error) throw profile.error
  if (profile.data?.crypto_status !== 'ready') return false

  let workspaceKey: Uint8Array | null = null
  try {
    const publicKey = base64UrlToBytes(profile.data.public_key as string)
    workspaceKey = await createWorkspaceKey()
    const sealed = await sealWorkspaceKey(workspaceKey, publicKey)
    const inserted = await supabase.from('workspace_member_key_envelopes').insert({
      workspace_id: workspaceId,
      user_id: userId,
      key_version: KEY_VERSION,
      recipient_public_key_fingerprint: profile.data.public_key_fingerprint,
      sealed_workspace_key: sealed,
    })
    if (inserted.error) throw inserted.error
    await sealFields('workspaces', workspaceId, { name: trimmed }, workspaceKey, workspaceId, KEY_VERSION)
    const marked = await supabase.rpc('mark_workspace_dual', {
      p_workspace_id: workspaceId,
      p_key_version: KEY_VERSION,
    })
    if (marked.error) throw marked.error
    const cut = await supabase.rpc('cutover_workspace_plaintext', { p_workspace_id: workspaceId })
    if (cut.error) throw cut.error
    holdWorkspaceKey(workspaceId, KEY_VERSION, workspaceKey)
    workspaceKey = null
  } finally {
    if (workspaceKey) zeroBytes(workspaceKey)
  }

  forgetDualWorkspaces()
  const displayName = await loadOwnDisplayName(userId)
  if (displayName) await publishDisplayName(userId, displayName, true)
  await copyOwnAvatar(userId)
  return true
}
