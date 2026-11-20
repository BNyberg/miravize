import { heldWorkspaceKey } from '@/features/crypto/field-mirror'
import { decryptField, encryptField } from '@/lib/crypto/formats'
import { supabase } from '@/lib/supabase'

export type AuditAction = 'invite.sent' | 'invite.accepted' | 'invite.revoked' | 'member.removed' | 'workspace.mfa_required'

type AuditInput = {
  workspaceId: string
  action: AuditAction
  actorUserId: string
  targetUserId?: string | null
  subjectId?: string | null
  occurredAt?: string
  detail: Record<string, string | null>
}

export async function recordAudit(input: AuditInput) {
  const held = heldWorkspaceKey(input.workspaceId)
  if (!held) throw new Error('Open this workspace before recording that action.')
  const id = crypto.randomUUID()
  const plain = JSON.stringify({
    action: input.action,
    actor_user_id: input.actorUserId,
    target_user_id: input.targetUserId ?? null,
    subject_id: input.subjectId ?? null,
    ...input.detail,
  })
  const aad = {
    workspaceId: input.workspaceId,
    table: 'audit_events',
    recordId: id,
    field: 'detail',
    keyVersion: held.keyVersion,
  }
  const encrypted = await encryptField(plain, held.key, aad)
  const opened = await decryptField(encrypted, held.key, aad)
  if (opened !== plain) throw new Error('Encrypted copy did not match the saved text.')
  const inserted = await supabase.from('audit_events').insert({
    id,
    workspace_id: input.workspaceId,
    action: input.action,
    actor_user_id: input.actorUserId,
    target_user_id: input.targetUserId ?? null,
    subject_id: input.subjectId ?? null,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    detail_ciphertext: encrypted,
  })
  if (inserted.error && inserted.error.code !== '23505') throw inserted.error
}

type InviteRow = {
  id: string
  workspace_id: string
  email: string
  role: string
  invited_by: string
  workspace_label: string | null
  created_at: string
  accepted_at: string | null
}

export async function archiveInvites() {
  const invites = await supabase
    .from('workspace_invites')
    .select('id, workspace_id, email, role, invited_by, workspace_label, created_at, accepted_at')
  if (invites.error) throw invites.error
  const rows = (invites.data ?? []) as InviteRow[]
  if (rows.length === 0) return
  const logged = await supabase.from('audit_events').select('subject_id, action')
  if (logged.error) throw logged.error
  const seen = new Set((logged.data ?? []).map((row) => `${row.subject_id}:${row.action}`))
  const peopleByWorkspace = new Map<string, { user_id: string; email: string }[]>()

  for (const invite of rows) {
    if (!heldWorkspaceKey(invite.workspace_id)) continue
    const label = invite.workspace_label?.trim() || ''
    if (!seen.has(`${invite.id}:invite.sent`)) {
      await recordAudit({
        workspaceId: invite.workspace_id,
        action: 'invite.sent',
        actorUserId: invite.invited_by,
        subjectId: invite.id,
        occurredAt: invite.created_at,
        detail: {
          target_email: invite.email,
          role: invite.role,
          workspace_label: label,
        },
      })
      seen.add(`${invite.id}:invite.sent`)
    }
    if (!invite.accepted_at) continue
    if (!seen.has(`${invite.id}:invite.accepted`)) {
      let people = peopleByWorkspace.get(invite.workspace_id)
      if (!people) {
        const listed = await supabase.rpc('workspace_people', { p_workspace_id: invite.workspace_id })
        if (listed.error) throw listed.error
        people = (listed.data ?? []) as { user_id: string; email: string }[]
        peopleByWorkspace.set(invite.workspace_id, people)
      }
      const member = people.find((person) => person.email.toLowerCase() === invite.email.toLowerCase())
      await recordAudit({
        workspaceId: invite.workspace_id,
        action: 'invite.accepted',
        actorUserId: member?.user_id ?? invite.invited_by,
        targetUserId: member?.user_id ?? null,
        subjectId: invite.id,
        occurredAt: invite.accepted_at,
        detail: {
          target_email: invite.email,
          role: invite.role,
          workspace_label: label,
          invited_by: invite.invited_by,
        },
      })
    }
    const retired = await supabase.rpc('retire_accepted_invite', { p_invite_id: invite.id })
    if (retired.error) throw retired.error
  }
}
