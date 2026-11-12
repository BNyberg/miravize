import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/auth-context'
import { ALL_WORKSPACES, useWorkspace } from '@/features/workspaces/workspace-context'
import { qk } from '@/lib/query-keys'
import { supabase } from '@/lib/supabase'
import type { WorkspaceInvite, WorkspaceRole } from '@/types'

export function SettingsPage() {
  const { user } = useAuth()
  const { workspaceId, isAll, canManage, current, setWorkspaceId } = useWorkspace()
  const qc = useQueryClient()
  const [wsName, setWsName] = useState('Personal')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('member')
  const [error, setError] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)

  const invites = useQuery({
    queryKey: qk.invites(workspaceId),
    enabled: !isAll && canManage,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('workspace_invites')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
      if (err) throw err
      return (data ?? []) as WorkspaceInvite[]
    },
  })

  const members = useQuery({
    queryKey: qk.members(workspaceId),
    enabled: !isAll,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('workspace_members')
        .select('id, role, user_id')
        .eq('workspace_id', workspaceId)
      if (err) throw err
      return data ?? []
    },
  })

  const createWs = useMutation({
    mutationFn: async () => {
      const { data, error: err } = await supabase.rpc('create_workspace', { p_name: wsName })
      if (err) throw err
      return data
    },
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: qk.memberships })
      if (data?.id) setWorkspaceId(data.id)
    },
    onError: (err: Error) => setError(err.message),
  })

  const sendInvite = useMutation({
    mutationFn: async () => {
      const { data, error: err } = await supabase.rpc('invite_to_workspace', {
        p_workspace_id: workspaceId,
        p_email: inviteEmail,
        p_role: inviteRole,
      })
      if (err) throw err
      return data
    },
    onSuccess: (data) => {
      setInviteUrl(`${window.location.origin}/invite/${data.token}`)
      void qc.invalidateQueries({ queryKey: qk.invites(workspaceId) })
    },
    onError: (err: Error) => setError(err.message),
  })

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Workspaces, invites, and appearance.</p>
      </div>
      {error ? (
        <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
          {error}
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Light by default. Dark mode is OLED black.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <ThemeToggle />
          <span className="text-sm">Toggle light / dark</span>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>New workspace</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input value={wsName} onChange={(e) => setWsName(e.target.value)} />
          <Button onClick={() => createWs.mutate()} disabled={createWs.isPending}>
            Create
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Signed in as {user?.email}. Role here: {isAll ? 'n/a (All view)' : current?.role ?? 'none'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isAll ? (
            <p className="text-sm text-muted-foreground">Switch to a workspace to manage members.</p>
          ) : (
            <>
              <ul className="text-sm">
                {members.data?.map((m) => (
                  <li key={m.id}>
                    {m.user_id === user?.id ? 'You' : m.user_id} · {m.role}
                  </li>
                ))}
              </ul>
              {canManage ? (
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    sendInvite.mutate()
                  }}
                >
                  <Input
                    type="email"
                    required
                    placeholder="email@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <Button type="submit">Invite</Button>
                </form>
              ) : null}
              {inviteUrl ? (
                <p className="text-sm">
                  Invite link: <a className="text-primary underline-offset-4 hover:underline" href={inviteUrl}>{inviteUrl}</a>
                </p>
              ) : null}
              <ul className="text-xs text-muted-foreground">
                {invites.data?.map((inv) => (
                  <li key={inv.id}>
                    {inv.email} · {inv.role} · {inv.accepted_at ? 'accepted' : 'pending'}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
      {workspaceId === ALL_WORKSPACES ? null : (
        <p className="text-xs text-muted-foreground">Workspace ID {workspaceId}</p>
      )}
    </div>
  )
}
