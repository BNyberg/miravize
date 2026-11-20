import { ClipboardDocumentIcon, PencilIcon, UserPlusIcon, UsersIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from '@/components/ui/toast'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  decodeWorkspaceIcon,
  encodeWorkspaceIcon,
  IconChooser,
  WorkspaceMark,
} from '@/components/workspaces/workspace-icon'
import { useAuth } from '@/features/auth/auth-context'
import { recordAudit } from '@/features/crypto/audit-log'
import { heldWorkspaceKey, mirrorSensitive } from '@/features/crypto/field-mirror'
import { sealCreatedWorkspace } from '@/features/crypto/seal-created-workspace'
import { revealMemberName } from '@/features/crypto/publish-display-name'
import { rotateWorkspaceKey } from '@/features/crypto/rotate-workspace-key'
import { ALL_WORKSPACES, useWorkspace } from '@/features/workspaces/workspace-context'
import { qk } from '@/lib/query-keys'
import { supabase } from '@/lib/supabase'
import { suggestWorkspaceIdCode, workspaceIdInput } from '@/lib/workspace-id-code'
import { cn } from '@/lib/utils'
import type { WorkspaceInvite, WorkspaceRole } from '@/types'

type Person = {
  id: string
  user_id: string
  email: string
  role: WorkspaceRole
}

type Access = {
  key: string
  email: string
  workspaceId: string
  role: WorkspaceRole
  status: 'accepted' | 'pending'
  memberId?: string
  inviteId?: string
  userId?: string
  canRemove: boolean
}

type ConfirmState = {
  kind: 'invite' | 'member'
  id: string
  name: string
  workspaceId?: string
  userId?: string
  role?: string
  encrypted?: boolean
} | null

async function inviteFailure(err: unknown) {
  const context =
    err && typeof err === 'object' && 'context' in err
      ? (err as { context?: { json?: () => Promise<unknown> } }).context
      : undefined
  if (context && typeof context.json === 'function') {
    const body = (await context.json().catch(() => null)) as { error?: unknown } | null
    if (body && typeof body.error === 'string' && body.error) return body.error
  }
  if (err instanceof Error && err.message) return err.message
  return 'Try again.'
}

export function SettingsPage() {
  const { user } = useAuth()
  const { workspaceId, isAll, memberships, setWorkspaceId, workspaces } = useWorkspace()
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [workspaceQuery, setWorkspaceQuery] = useState('')
  const [userQuery, setUserQuery] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteChips, setInviteChips] = useState<string[]>([])
  const [inviteDraft, setInviteDraft] = useState('')
  const [inviteWorkspaceId, setInviteWorkspaceId] = useState('')
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('member')
  const [name, setName] = useState('')
  const [requireMfa, setRequireMfa] = useState(false)
  const [hero, setHero] = useState<string | null>(null)
  const [custom, setCustom] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftId, setDraftId] = useState('')
  const [idConfirm, setIdConfirm] = useState<string | null>(null)
  const [draftHero, setDraftHero] = useState<string | null>(null)
  const [draftCustom, setDraftCustom] = useState('')
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [removePassword, setRemovePassword] = useState('')

  const visible = useMemo(
    () => (isAll ? memberships : memberships.filter((row) => row.workspace_id === workspaceId)),
    [isAll, memberships, workspaceId],
  )
  const manageable = useMemo(
    () => memberships.filter((row) => row.role === 'owner' || row.role === 'admin'),
    [memberships],
  )

  useEffect(() => {
    if (!visible.some((row) => row.workspace_id === selectedId)) {
      setSelectedId(visible[0]?.workspace_id ?? null)
    }
  }, [selectedId, visible])

  const selected = visible.find((row) => row.workspace_id === selectedId) ?? null
  const canManage = selected?.role === 'owner' || selected?.role === 'admin'
  const loadedName = selected?.workspace.name
  const loadedIcon = selected?.workspace.icon ?? null
  const loadedRequireMfa = selected?.workspace.require_mfa ?? false
  const loadedWorkspaceId = selected?.workspace_id

  useEffect(() => {
    if (!loadedWorkspaceId) return
    const decoded = decodeWorkspaceIcon(loadedIcon)
    setName(loadedName ?? '')
    setHero(decoded.hero)
    setCustom(decoded.custom)
    setRequireMfa(loadedRequireMfa)
  }, [loadedIcon, loadedName, loadedRequireMfa, loadedWorkspaceId])

  const encoded = encodeWorkspaceIcon(custom, hero)
  const dirty =
    Boolean(selected) &&
    (name.trim() !== selected?.workspace.name.trim() ||
      !encoded.ok ||
      encoded.value !== loadedIcon ||
      requireMfa !== loadedRequireMfa)

  const peopleQueries = useQueries({
    queries: visible.map((row) => ({
      queryKey: qk.members(row.workspace_id),
      queryFn: async () => {
        const { data, error } = await supabase.rpc('workspace_people', { p_workspace_id: row.workspace_id })
        if (error) throw error
        const rows = (data ?? []) as (Person & { full_name: string | null; avatar_url: string | null; display_name_ciphertext?: unknown; avatar_ciphertext?: unknown })[]
        const revealed = await Promise.all(rows.map((person) => revealMemberName(row.workspace_id, person)))
        return revealed as Person[]
      },
    })),
  })

  const inviteSources = useMemo(
    () => visible.filter((row) => row.role === 'owner' || row.role === 'admin'),
    [visible],
  )
  const inviteQueries = useQueries({
    queries: inviteSources.map((row) => ({
      queryKey: qk.invites(row.workspace_id),
      queryFn: async () => {
        const { data, error } = await supabase
          .from('workspace_invites')
          .select('*')
          .eq('workspace_id', row.workspace_id)
          .order('created_at', { ascending: false })
        if (error) throw error
        return (data ?? []) as WorkspaceInvite[]
      },
    })),
  })

  const access = useMemo(() => {
    const rows: Access[] = []
    visible.forEach((membership, index) => {
      const people = peopleQueries[index]?.data ?? []
      for (const person of people) {
        rows.push({
          key: person.id,
          email: person.email,
          workspaceId: membership.workspace_id,
          role: person.role,
          status: 'accepted',
          memberId: person.id,
          userId: person.user_id,
          canRemove: membership.role === 'owner' && person.role !== 'owner',
        })
      }
    })
    inviteSources.forEach((membership, index) => {
      const invites = inviteQueries[index]?.data ?? []
      for (const invite of invites) {
        if (invite.accepted_at) continue
        const already = rows.some(
          (row) =>
            row.workspaceId === invite.workspace_id && row.email.toLowerCase() === invite.email.toLowerCase(),
        )
        if (already) continue
        rows.push({
          key: invite.id,
          email: invite.email,
          workspaceId: invite.workspace_id,
          role: invite.role,
          status: 'pending',
          inviteId: invite.id,
          canRemove: true,
        })
      }
    })
    return rows
  }, [inviteQueries, inviteSources, peopleQueries, visible])

  const selectedAccess = access.filter((row) => row.workspaceId === selected?.workspace_id)
  const shownAccess = useMemo(() => {
    const query = userQuery.trim().toLowerCase()
    if (!query) return selectedAccess
    return selectedAccess.filter((row) => row.email.toLowerCase().includes(query))
  }, [selectedAccess, userQuery])
  const inviteEmails = useMemo(() => {
    const draft = normalizeEmail(inviteDraft)
    if (!draft || inviteChips.includes(draft)) return inviteChips
    return [...inviteChips, draft]
  }, [inviteChips, inviteDraft])
  const memberCounts = useMemo(() => {
    const counts = new Map<string, number>()
    visible.forEach((row, index) => {
      const people = peopleQueries[index]?.data
      if (people) counts.set(row.workspace_id, people.length)
    })
    return counts
  }, [peopleQueries, visible])
  const listed = useMemo(() => {
    const query = workspaceQuery.trim().toLowerCase()
    if (!query) return visible
    return visible.filter((row) => row.workspace.name.toLowerCase().includes(query))
  }, [visible, workspaceQuery])
  const draftIcon = encodeWorkspaceIcon(draftCustom, draftHero)
  const draftSuggestion = suggestWorkspaceIdCode(draftName)
  const confirmedCode = (idConfirm ?? '').trim() || draftSuggestion

  async function refreshPeople() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['members'] }),
      qc.invalidateQueries({ queryKey: ['invites'] }),
      qc.invalidateQueries({ queryKey: qk.memberships }),
    ])
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!selected) return
      const next = encodeWorkspaceIcon(custom, hero)
      const nameChanged = name.trim() !== selected.workspace.name.trim()
      const iconChanged = !next.ok || next.value !== (selected.workspace.icon ?? null)
      if (nameChanged || iconChanged) {
        if (!next.ok) throw new Error('Use one emoji or up to two letters.')
        const { error } = await supabase.rpc('update_workspace', {
          p_workspace_id: selected.workspace_id,
          p_name: name.trim(),
          p_icon: next.value,
        })
        if (error) throw error
        if (nameChanged) await mirrorSensitive('workspaces', selected.workspace_id, { name: name.trim() })
      }
      if (requireMfa !== (selected.workspace.require_mfa ?? false)) {
        const { error } = await supabase.rpc('set_workspace_require_mfa', {
          p_workspace_id: selected.workspace_id,
          p_require_mfa: requireMfa,
        })
        if (error) throw error
        if (!user?.id) throw new Error('Not signed in')
        await recordAudit({
          workspaceId: selected.workspace_id,
          action: 'workspace.mfa_required',
          actorUserId: user.id,
          detail: {
            require_mfa: requireMfa ? 'true' : 'false',
            workspace_label: selected.workspace.name,
          },
        })
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.memberships })
    },
    onError: (err: Error) => toast({ tone: 'error', title: "Couldn't save workspace", description: err.message }),
  })

  const createWs = useMutation({
    mutationFn: async (idCode: string) => {
      const icon = encodeWorkspaceIcon(draftCustom, draftHero)
      if (!icon.ok) throw new Error('Use one emoji or up to two letters.')
      const taken = memberships.some((row) => row.workspace.id_code === idCode)
      if (taken) throw new Error(`ID ${idCode} is already used.`)
      const { data, error } = await supabase.rpc('create_workspace', {
        p_name: draftName.trim(),
        p_id_code: idCode,
      })
      if (error) throw error
      const id = (data as { id: string }).id
      if (icon.value) {
        const { error: updateError } = await supabase.rpc('update_workspace', {
          p_workspace_id: id,
          p_name: draftName.trim(),
          p_icon: icon.value,
        })
        if (updateError) throw updateError
      }
      const sealed = await sealCreatedWorkspace(id, draftName.trim())
      if (!sealed) throw new Error('Save your recovery key before creating a workspace.')
      return { id }
    },
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: qk.memberships })
      setDraftName('')
      setDraftId('')
      setIdConfirm(null)
      setDraftHero(null)
      setDraftCustom('')
      if (data?.id) {
        setSelectedId(data.id)
        setWorkspaceId(data.id)
      }
    },
    onError: (err: Error) => toast({ tone: 'error', title: "Couldn't create workspace", description: err.message }),
  })

  function startCreate() {
    if (!draftName.trim() || !draftIcon.ok || createWs.isPending) return
    if (!draftId.trim()) {
      setIdConfirm(draftSuggestion)
      return
    }
    createWs.mutate(draftId.trim())
  }

  const sendInvites = useMutation({
    mutationFn: async () => {
      for (const email of inviteEmails) {
        const label = workspaces.find((row) => row.id === inviteWorkspaceId)?.name?.trim() || ''
        const { data, error } = await supabase.rpc('invite_to_workspace', {
          p_workspace_id: inviteWorkspaceId,
          p_email: email,
          p_role: inviteRole,
          p_label: label,
        })
        if (error) throw error
        const invite = data as { id?: string } | null
        if (!invite?.id) throw new Error('Invite saved, but the email could not be sent.')
        const { data: sent, error: fnErr } = await supabase.functions.invoke('send-invite', {
          body: { invite_id: invite.id, origin: window.location.origin },
        })
        if (fnErr) throw new Error(await inviteFailure(fnErr))
        if (sent && typeof sent === 'object' && 'error' in sent && sent.error) {
          throw new Error(String(sent.error))
        }
        if (user?.id && heldWorkspaceKey(inviteWorkspaceId)) {
          await recordAudit({
            workspaceId: inviteWorkspaceId,
            action: 'invite.sent',
            actorUserId: user.id,
            subjectId: invite.id,
            detail: {
              target_email: email,
              role: inviteRole,
              workspace_label: label,
            },
          })
        }
      }
    },
    onSuccess: async () => {
      setInviteOpen(false)
      setInviteChips([])
      setInviteDraft('')
      setInviteRole('member')
      await refreshPeople()
    },
    onError: (err: Error) => toast({ tone: 'error', title: "Couldn't send invite", description: err.message }),
  })

  const revokeInvite = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) throw new Error('Not signed in')
      const invite = await supabase
        .from('workspace_invites')
        .select('id, workspace_id, email, role, workspace_label')
        .eq('id', id)
        .maybeSingle()
      if (invite.error) throw invite.error
      if (invite.data) {
        await recordAudit({
          workspaceId: invite.data.workspace_id as string,
          action: 'invite.revoked',
          actorUserId: user.id,
          subjectId: invite.data.id as string,
          detail: {
            target_email: invite.data.email as string,
            role: invite.data.role as string,
            workspace_label: (invite.data.workspace_label as string | null) ?? '',
          },
        })
      }
      const { error } = await supabase.rpc('revoke_workspace_invite', { p_invite_id: id })
      if (error) throw error
    },
    onSuccess: async () => {
      setConfirm(null)
      await refreshPeople()
    },
    onError: (err: Error) => toast({ tone: 'error', title: "Couldn't delete invite", description: err.message }),
  })

  const removeMember = useMutation({
    mutationFn: async (row: ConfirmState) => {
      if (!row || row.kind !== 'member') return
      if (row.encrypted) {
        if (!user?.email || !row.workspaceId || !row.userId || removePassword.length === 0) {
          throw new Error('Enter your password to rotate the workspace key.')
        }
        await rotateWorkspaceKey(user.email, removePassword, row.workspaceId, [row.userId])
      }
      if (!user?.id || !row.workspaceId) throw new Error('Not signed in')
      await recordAudit({
        workspaceId: row.workspaceId,
        action: 'member.removed',
        actorUserId: user.id,
        targetUserId: row.userId,
        subjectId: row.id,
        detail: {
          target_email: row.name,
          role: row.role ?? '',
        },
      })
      const { error } = await supabase.from('workspace_members').delete().eq('id', row.id)
      if (error) throw error
    },
    onSuccess: async () => {
      setConfirm(null)
      await refreshPeople()
    },
    onError: (err: Error) => toast({ tone: 'error', title: "Couldn't delete member", description: err.message }),
  })

  function openInvite() {
    const preferred =
      manageable.find((row) => row.workspace_id === selected?.workspace_id) ?? manageable[0]
    setInviteWorkspaceId(preferred?.workspace_id ?? '')
    setInviteRole('member')
    setInviteChips([])
    setInviteDraft('')
    setInviteOpen(true)
  }

  function askRemove(row: Access) {
    if (!row.canRemove) return
    if (row.status === 'pending' && row.inviteId) {
      setConfirm({ kind: 'invite', id: row.inviteId, name: row.email })
      return
    }
    if (row.memberId) {
      const workspace = workspaces.find((item) => item.id === row.workspaceId)
      const encrypted = workspace?.encryption_status === 'dual' || workspace?.encryption_status === 'ciphertext_only'
      setRemovePassword('')
      setConfirm({
        kind: 'member',
        id: row.memberId,
        name: row.email,
        workspaceId: row.workspaceId,
        userId: row.userId,
        role: row.role,
        encrypted,
      })
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto lg:overflow-hidden">
      <h1 className="sr-only">Settings</h1>
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
            <div className="shrink-0 border-b border-border p-2">
              <Input
                aria-label="Search workspaces"
                className="h-9"
                value={workspaceQuery}
                onChange={(event) => setWorkspaceQuery(event.target.value)}
              />
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {listed.length === 0 ? (
                <li className="px-2.5 py-2 text-sm text-muted-foreground">
                  {visible.length === 0 ? 'No workspaces yet.' : 'No matches.'}
                </li>
              ) : (
                listed.map((row) => {
                  const count = memberCounts.get(row.workspace_id)
                  return (
                    <li key={row.id} className="border-t border-border first:border-t-0">
                      <button
                        type="button"
                        className={cn(
                          'flex h-9 w-full items-center gap-2 px-2.5 text-left',
                          selected?.id === row.id && 'bg-muted',
                        )}
                        onClick={() => setSelectedId(row.workspace_id)}
                      >
                        <WorkspaceMark icon={row.workspace.icon} />
                        <span className="min-w-0 truncate text-sm">{row.workspace.name}</span>
                        {count != null ? (
                          <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md border border-border bg-card px-1.5 text-xs text-muted-foreground">
                            <UsersIcon className="size-3.5" aria-hidden="true" />
                            {count}
                          </span>
                        ) : null}
                        <span className="ml-auto shrink-0 text-xs capitalize text-muted-foreground">{row.role}</span>
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
            <div className="flex shrink-0 items-center gap-2 border-t border-border p-2">
              <IconChooser
                hero={draftHero}
                custom={draftCustom}
                onHero={(value) => {
                  setDraftHero(value)
                  setDraftCustom('')
                }}
                onCustom={(value) => {
                  setDraftCustom(value)
                  if (value.trim()) setDraftHero(null)
                }}
              >
                <button
                  type="button"
                  aria-label="Choose icon"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border"
                >
                  <WorkspaceMark icon={draftIcon.ok ? draftIcon.value : null} />
                </button>
              </IconChooser>
              <Input
                aria-label="Name"
                className="h-9 min-w-0 flex-1"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') startCreate()
                }}
              />
              <Input
                aria-label="ID"
                className="h-9 w-[3.4rem] shrink-0 text-center uppercase"
                placeholder={draftSuggestion}
                value={draftId}
                onChange={(event) => setDraftId(workspaceIdInput(event.target.value))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') startCreate()
                }}
              />
              <Button
                type="button"
                className="h-9 shrink-0 px-2.5"
                disabled={!draftName.trim() || !draftIcon.ok}
                loading={createWs.isPending}
                onClick={startCreate}
              >
                + Add
              </Button>
            </div>
          </div>
          <div className="flex h-full min-h-0 flex-col gap-4">
            {selected ? (
              <WorkspaceFields
                name={name}
                idCode={selected.workspace.id_code}
                canManage={canManage}
                requireMfa={requireMfa}
                hero={hero}
                custom={custom}
                preview={encoded.ok ? encoded.value : loadedIcon}
                dirty={dirty && Boolean(name.trim())}
                saving={save.isPending}
                onName={setName}
                onRequireMfa={setRequireMfa}
                onHero={(value) => {
                  setHero(value)
                  setCustom('')
                }}
                onCustom={(value) => {
                  setCustom(value)
                  if (value.trim()) setHero(null)
                }}
                onDefault={() => {
                  setHero(null)
                  setCustom('')
                }}
                onSave={() => save.mutate()}
              />
            ) : workspaceId === ALL_WORKSPACES ? (
              <p className="text-sm text-muted-foreground">Create a workspace to get started.</p>
            ) : null}
            {selected ? (
              <>
                <div className="flex shrink-0 items-center gap-2">
                  <Input
                    aria-label="Search"
                    className="h-9 w-56"
                    placeholder="Search"
                    value={userQuery}
                    onChange={(event) => setUserQuery(event.target.value)}
                  />
                  {manageable.length > 0 ? (
                    <Button type="button" className="ml-auto h-9" onClick={openInvite}>
                      <UserPlusIcon className="size-4" aria-hidden="true" />
                      User
                    </Button>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
                  <div className="h-full overflow-auto">
                    <AccessTable
                      rows={shownAccess}
                      youId={user?.id}
                      onRemove={askRemove}
                      empty={userQuery.trim() ? 'No matches.' : 'No one has access yet.'}
                    />
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>

      <Dialog open={idConfirm !== null} onOpenChange={(open) => { if (!open) setIdConfirm(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Use ID {confirmedCode}?</DialogTitle>
            <DialogDescription>
              Tasks and requests will look like T-{confirmedCode}01 and R-{confirmedCode}01.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="ID"
            className="h-9 uppercase"
            value={idConfirm ?? ''}
            onChange={(event) => setIdConfirm(workspaceIdInput(event.target.value))}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIdConfirm(null)}>
              Cancel
            </Button>
            <Button type="button" loading={createWs.isPending} disabled={!confirmedCode} onClick={() => createWs.mutate(confirmedCode)}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(confirm)}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null)
            setRemovePassword('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-bold text-destructive">
              {confirm?.kind === 'member' ? `Delete ${confirm.name}?` : 'Delete invite?'}
            </DialogTitle>
            <DialogDescription>
              {confirm?.kind === 'member' && confirm.encrypted
                ? 'The workspace encryption key is rotated first, so this person can no longer read its names.'
                : 'This action is irreversible.'}
            </DialogDescription>
          </DialogHeader>
          {confirm?.kind === 'member' && confirm.encrypted ? (
            <div className="grid gap-1.5">
              <Label htmlFor="remove-member-password">Current password</Label>
              <Input
                id="remove-member-password"
                type="password"
                autoComplete="current-password"
                value={removePassword}
                onChange={(event) => setRemovePassword(event.target.value)}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={revokeInvite.isPending || removeMember.isPending}
              disabled={confirm?.kind === 'member' && confirm.encrypted && removePassword.length === 0}
              onClick={() => {
                if (!confirm) return
                if (confirm.kind === 'invite') revokeInvite.mutate(confirm.id)
                else removeMember.mutate(confirm)
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (inviteEmails.length === 0 || !inviteWorkspaceId) return
              sendInvites.mutate()
            }}
          >
            <DialogHeader className="sr-only">
              <DialogTitle>Invite</DialogTitle>
            </DialogHeader>
            <EmailChips
              chips={inviteChips}
              draft={inviteDraft}
              onChips={setInviteChips}
              onDraft={setInviteDraft}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select value={inviteWorkspaceId} onValueChange={setInviteWorkspaceId}>
                <SelectTrigger className="h-9" aria-label="Workspace">
                  <SelectValue placeholder="Workspace" />
                </SelectTrigger>
                <SelectContent>
                  {manageable.map((row) => (
                    <SelectItem key={row.workspace_id} value={row.workspace_id}>
                      {row.workspace.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as WorkspaceRole)}>
                <SelectTrigger className="h-9" aria-label="Role">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={inviteEmails.length === 0 || !inviteWorkspaceId} loading={sendInvites.isPending}>
                Invite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function WorkspaceFields({
  name,
  idCode,
  canManage,
  requireMfa,
  hero,
  custom,
  preview,
  dirty,
  saving,
  onName,
  onRequireMfa,
  onHero,
  onCustom,
  onDefault,
  onSave,
}: {
  name: string
  idCode: string
  canManage: boolean
  requireMfa: boolean
  hero: string | null
  custom: string
  preview: string | null
  dirty: boolean
  saving: boolean
  onName: (value: string) => void
  onRequireMfa: (value: boolean) => void
  onHero: (value: string) => void
  onCustom: (value: string) => void
  onDefault: () => void
  onSave: () => void
}) {
  return (
    <div className="shrink-0 rounded-lg border border-border bg-card p-4">
      <Label htmlFor="ws-name">Name of workspace</Label>
      <Input
        id="ws-name"
        className="mt-2 h-9"
        value={name}
        disabled={!canManage}
        onChange={(event) => onName(event.target.value)}
      />
      <div className="mt-3 flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="ws-require-mfa">Require an authenticator</Label>
          <p className="text-sm text-muted-foreground">
            People without an authenticator cannot open this workspace. This account already uses one.
          </p>
        </div>
        <Switch id="ws-require-mfa" checked={requireMfa} disabled={!canManage} onCheckedChange={onRequireMfa} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border">
          <WorkspaceMark icon={preview} />
        </span>
        <IconChooser hero={hero} custom={custom} onHero={onHero} onCustom={onCustom}>
          <Button type="button" variant="outline" className="h-9" disabled={!canManage}>
            Change icon
          </Button>
        </IconChooser>
        <Button type="button" variant="outline" className="h-9" disabled={!canManage} onClick={onDefault}>
          Reset icon
        </Button>
        <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="w-[3.4rem] cursor-not-allowed">
              <Input
                aria-label="Task and request ID"
                readOnly
                tabIndex={-1}
                value={idCode}
                className="pointer-events-none h-9 text-center text-muted-foreground"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>This is the task and request identifier.</TooltipContent>
        </Tooltip>
        {canManage ? (
          <Button type="button" className="ml-auto h-9" disabled={!dirty} loading={saving} onClick={onSave}>
            Save
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase()
  if (!email.includes('@') || !email.split('@')[1]?.includes('.')) return null
  return email
}

function absorbEmails(chips: string[], value: string, flush: boolean) {
  const parts = value.split(/[\s,;]+/)
  const endsWithBreak = /[\s,;]$/.test(value)
  const pending = !flush && !endsWithBreak ? (parts.pop() ?? '') : ''
  const next = [...chips]
  for (const part of parts) {
    const email = normalizeEmail(part)
    if (!email || next.includes(email)) continue
    next.push(email)
  }
  return { chips: next, draft: pending }
}

function EmailChips({
  chips,
  draft,
  onChips,
  onDraft,
}: {
  chips: string[]
  draft: string
  onChips: (chips: string[]) => void
  onDraft: (draft: string) => void
}) {
  const field = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  function copyEmail(email: string) {
    void navigator.clipboard.writeText(email).catch(() => {
      toast({ tone: 'error', title: "Couldn't copy email", description: email })
    })
  }

  function saveEdit() {
    if (editing == null) return
    const email = normalizeEmail(editValue)
    const index = editing
    setEditing(null)
    if (!email || (chips.includes(email) && chips[index] !== email)) return
    onChips(chips.map((chip, chipIndex) => (chipIndex === index ? email : chip)))
  }

  return (
    <div
      className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault()
          field.current?.focus()
        }
      }}
    >
      {chips.map((email, index) =>
        editing === index ? (
          <input
            key={`${email}-edit`}
            aria-label={`Edit ${email}`}
            autoFocus
            className="h-6 w-40 rounded-md border border-border bg-background px-1.5 text-xs outline-none"
            value={editValue}
            onChange={(event) => setEditValue(event.target.value)}
            onBlur={saveEdit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                saveEdit()
              }
              if (event.key === 'Escape') setEditing(null)
            }}
          />
        ) : (
          <span
            key={email}
            className="group relative inline-flex h-6 max-w-full items-center rounded-md border border-border px-1.5 text-xs"
          >
            <span className="truncate">{email}</span>
            <span className="absolute inset-0 hidden items-center justify-center gap-1 rounded-md bg-foreground/80 text-background group-hover:flex">
              <button
                type="button"
                className="inline-flex size-4 items-center justify-center"
                aria-label={`Edit ${email}`}
                onClick={() => {
                  setEditing(index)
                  setEditValue(email)
                }}
              >
                <PencilIcon className="size-3.5" />
              </button>
              <button
                type="button"
                className="inline-flex size-4 items-center justify-center"
                aria-label={`Copy ${email}`}
                onClick={() => copyEmail(email)}
              >
                <ClipboardDocumentIcon className="size-3.5" />
              </button>
              <button
                type="button"
                className="inline-flex size-4 items-center justify-center"
                aria-label={`Remove ${email}`}
                onClick={() => onChips(chips.filter((chip) => chip !== email))}
              >
                <XMarkIcon className="size-3.5" />
              </button>
            </span>
          </span>
        ),
      )}
      <input
        ref={field}
        aria-label="Emails"
        className="h-6 min-w-32 flex-1 bg-transparent text-sm outline-none"
        placeholder={chips.length === 0 ? 'Add 1 or more emails' : ''}
        value={draft}
        onChange={(event) => {
          const value = event.target.value
          if (/[\s,;]/.test(value)) {
            const next = absorbEmails(chips, value, false)
            onChips(next.chips)
            onDraft(next.draft)
            return
          }
          onDraft(value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault()
            const next = absorbEmails(chips, event.currentTarget.value, true)
            onChips(next.chips)
            onDraft('')
            return
          }
          if (event.key === 'Backspace' && event.currentTarget.value === '' && chips.length > 0) {
            onChips(chips.slice(0, -1))
          }
        }}
        onPaste={(event) => {
          const text = event.clipboardData.getData('text')
          if (!/[\s,;]/.test(text)) return
          event.preventDefault()
          const next = absorbEmails(chips, text, true)
          onChips(next.chips)
          onDraft(next.draft)
        }}
        onBlur={(event) => {
          const next = absorbEmails(chips, event.currentTarget.value, true)
          onChips(next.chips)
          onDraft(next.draft)
        }}
      />
    </div>
  )
}

function AccessTable({
  rows,
  youId,
  onRemove,
  empty,
}: {
  rows: Access[]
  youId: string | undefined
  onRemove: (row: Access) => void
  empty: string
}) {
  if (rows.length === 0) return <p className="px-3 py-3 text-sm text-muted-foreground">{empty}</p>
  return (
    <Table className="w-max min-w-full">
      <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card">
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="sticky right-0 z-20 w-20 border-l border-border bg-card">
            <span className="sr-only">Remove</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell className="whitespace-nowrap">
              {row.email}
              {row.userId === youId ? ' (you)' : ''}
            </TableCell>
            <TableCell className="capitalize">{row.role}</TableCell>
            <TableCell className="text-muted-foreground">{row.status}</TableCell>
            <TableCell className="sticky right-0 border-l border-border bg-card">
              {row.canRemove ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex size-7 items-center justify-center rounded-md hover:bg-muted"
                      aria-label={row.status === 'pending' ? `Delete invite for ${row.email}` : `Delete ${row.email}`}
                      onClick={() => onRemove(row)}
                    >
                      <XMarkIcon className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {row.status === 'pending' ? 'Delete invite' : 'Remove user'}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
