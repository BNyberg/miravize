import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { heldWorkspaceKey, holdWorkspaceKey } from '@/features/crypto/field-mirror'
import { migrateStoredAvatar } from '@/features/crypto/publish-avatar'
import { loadOwnDisplayName, publishDisplayName } from '@/features/crypto/publish-display-name'
import { forgetDualWorkspaces } from '@/features/crypto/read-copy'
import {
  peekSessionPrivateKey,
  replaceEnvelopePresence,
  type EnvelopePresence,
} from '@/features/crypto/session-private-key'
import { openWorkspaceKey } from '@/lib/crypto/workspace-keys'
import { supabase } from '@/lib/supabase'

async function adoptSharedWorkspaceKeys() {
  const user = await supabase.auth.getUser()
  const userId = user.data.user?.id
  if (!userId) return false
  const secret = peekSessionPrivateKey()
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
  let opened = false
  const next = new Map<string, EnvelopePresence>()
  for (const workspace of workspaces.data ?? []) {
    const workspaceId = workspace.id as string
    const keyVersion = workspace.current_key_version as number | null
    const envelope = (envelopes.data ?? []).find(
      (row) => row.workspace_id === workspaceId && row.key_version === keyVersion,
    )
    next.set(workspaceId, envelope?.sealed_workspace_key ? 'present' : 'absent')
    if (!envelope?.sealed_workspace_key || typeof keyVersion !== 'number') continue
    if (heldWorkspaceKey(workspaceId)) continue
    if (!secret || secret.userId !== userId) continue
    const workspaceKey = await openWorkspaceKey(envelope.sealed_workspace_key as string, secret.publicKey, secret.privateKey)
    holdWorkspaceKey(workspaceId, keyVersion, workspaceKey)
    opened = true
  }
  replaceEnvelopePresence(next)
  if (opened) forgetDualWorkspaces()
  const current = await loadOwnDisplayName(userId)
  if (current.trim()) await publishDisplayName(userId, current, true)
  await migrateStoredAvatar(userId)
  return opened
}

export function AdoptSharedKeys() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const opened = await adoptSharedWorkspaceKeys()
        if (!cancelled && opened) await queryClient.invalidateQueries()
      } catch {
        // A later pass opens the key. The page stays up.
      }
    }
    void run()
    const timer = window.setInterval(() => void run(), 4000)
    window.addEventListener('focus', run)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', run)
    }
  }, [queryClient])

  return null
}
