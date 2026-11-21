import { useEffect } from 'react'

import { toast } from 'sonner'
import { listHeldWorkspaceKeys } from '@/features/crypto/field-mirror'
import { base64UrlToBytes } from '@/lib/crypto/bytes'
import { sealWorkspaceKey } from '@/lib/crypto/workspace-keys'
import { supabase } from '@/lib/supabase'

type Recipient = {
  user_id: string
  public_key: string
  public_key_fingerprint: string
}

export async function shareWorkspaceKey(
  workspaceId: string,
  keyVersion: number,
  key: Uint8Array,
  excludeUserIds: string[] = [],
) {
  const missing = await supabase.rpc('workspace_members_missing_key', {
    p_workspace_id: workspaceId,
    p_key_version: keyVersion,
  })
  if (missing.error) throw missing.error
  const recipients = ((missing.data ?? []) as Recipient[]).filter((row) => !excludeUserIds.includes(row.user_id))
  for (const recipient of recipients) {
    const sealed = await sealWorkspaceKey(key, base64UrlToBytes(recipient.public_key))
    const granted = await supabase.rpc('grant_workspace_key_envelope', {
      p_workspace_id: workspaceId,
      p_user_id: recipient.user_id,
      p_key_version: keyVersion,
      p_sealed: sealed,
      p_fingerprint: recipient.public_key_fingerprint,
    })
    if (granted.error) throw granted.error
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message
  return ''
}

async function shareHeldKeys() {
  const held = listHeldWorkspaceKeys()
  if (held.length === 0) return
  const workspaces = await supabase
    .from('workspaces')
    .select('id, current_key_version, key_rotation_status')
    .in('id', held.map((item) => item.workspaceId))
  if (workspaces.error) throw workspaces.error
  for (const workspace of workspaces.data ?? []) {
    if (workspace.key_rotation_status !== 'stable') continue
    const match = held.find(
      (item) => item.workspaceId === workspace.id && item.keyVersion === workspace.current_key_version,
    )
    if (!match) continue
    try {
      await shareWorkspaceKey(match.workspaceId, match.keyVersion, match.key)
    } catch (error) {
      if (errorMessage(error).includes('Not allowed')) continue
      throw error
    }
  }
}

export function ShareWorkspaceKeys() {
  useEffect(() => {
    let notified = false
    async function run() {
      try {
        await shareHeldKeys()
      } catch (error) {
        if (notified) return
        notified = true
        toast.error("Couldn't share a workspace key", { description: errorMessage(error) || 'Try again.' })
      }
    }
    void run()
    function onFocus() {
      void run()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])
  return null
}
