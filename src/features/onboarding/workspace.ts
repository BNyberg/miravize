import { holdWorkspaceKey, sealFields } from '@/features/crypto/field-mirror'
import { unlockWorkspace } from '@/features/crypto/personal-backfill'
import { unlockPrivateKeyWithPassword, type PasswordWrappedPrivateKey } from '@/lib/crypto/account-keys'
import { base64UrlToBytes, zeroBytes } from '@/lib/crypto/bytes'
import { createWorkspaceKey, openWorkspaceKey, sealWorkspaceKey } from '@/lib/crypto/workspace-keys'
import { supabase } from '@/lib/supabase'

const KEY_VERSION = 1

export type OnboardingWorkspace = {
  id: string
  name: string
  id_code: string
  encryption_status: string
  role: 'owner' | 'admin' | 'member'
  created: boolean
}

export async function loadOnboardingWorkspace(input?: { name?: string; idCode?: string; icon?: string | null }) {
  const result = await supabase.rpc('provision_onboarding_workspace', {
    p_name: input?.name ?? '',
    p_id_code: input?.idCode ?? '',
    p_icon: input?.icon ?? null,
  })
  if (result.error) throw result.error
  const row = Array.isArray(result.data) ? result.data[0] : result.data
  if (!row) return null
  return row as OnboardingWorkspace
}

async function sealPlainWorkspace(email: string, password: string, workspace: OnboardingWorkspace) {
  const user = await supabase.auth.getUser()
  const userId = user.data.user?.id
  if (!userId) throw new Error('Not signed in')
  const profile = await supabase
    .from('user_crypto_profiles')
    .select('public_key, public_key_fingerprint, encrypted_private_key, crypto_status')
    .maybeSingle()
  if (profile.error) throw profile.error
  if (profile.data?.crypto_status !== 'ready') throw new Error('Save your recovery key before creating a workspace.')

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
      .eq('workspace_id', workspace.id)
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
        workspace_id: workspace.id,
        user_id: userId,
        key_version: KEY_VERSION,
        recipient_public_key_fingerprint: profile.data.public_key_fingerprint,
        sealed_workspace_key: sealed,
      })
      if (inserted.error) throw inserted.error
    }
    const current = await supabase.from('workspaces').select('name').eq('id', workspace.id).single()
    if (current.error) throw current.error
    await sealFields('workspaces', workspace.id, { name: current.data.name as string }, workspaceKey, workspace.id, KEY_VERSION)
    const marked = await supabase.rpc('mark_workspace_dual', {
      p_workspace_id: workspace.id,
      p_key_version: KEY_VERSION,
    })
    if (marked.error) throw marked.error
    holdWorkspaceKey(workspace.id, KEY_VERSION, workspaceKey)
    workspaceKey = null
  } finally {
    zeroBytes(privateKey)
    if (workspaceKey) zeroBytes(workspaceKey)
  }
  void email
}

export async function finishOnboardingWorkspace(email: string, password: string, workspace: OnboardingWorkspace) {
  if (workspace.role !== 'owner') return workspace.id
  if (workspace.encryption_status === 'plaintext') {
    await sealPlainWorkspace(email, password, workspace)
  }
  if (workspace.encryption_status !== 'ciphertext_only') {
    const cut = await supabase.rpc('cutover_workspace_plaintext', { p_workspace_id: workspace.id })
    if (cut.error) throw cut.error
  }
  await unlockWorkspace(email, password, workspace.id_code)
  return workspace.id
}
