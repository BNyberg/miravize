import { Buildings, Pause } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { EntryMetaChips } from '@/components/timer/entry-editor'
import { Button } from '@/components/ui/button'
import { useCatalog } from '@/features/projects/use-catalog'
import { useNow } from '@/features/timer/use-now'
import { useRunningTimer } from '@/features/timer/use-running-timer'
import { useWorkspace } from '@/features/workspaces/workspace-context'
import { qk } from '@/lib/query-keys'
import { formatDuration } from '@/lib/splits'
import { supabase } from '@/lib/supabase'
import { updateEntryDescription, updateRunningEntry } from '@/lib/timer'
import type { Activity, Client, Project, ProjectClient } from '@/types'

export function RunningBanner() {
  const { data: running } = useRunningTimer()
  const { workspaceId, isAll, workspaces } = useWorkspace()
  const catalog = useCatalog()
  const now = useNow(Boolean(running))
  const qc = useQueryClient()

  const otherWorkspace = Boolean(running && !isAll && running.workspace_id !== workspaceId)
  const otherId = otherWorkspace && running ? running.workspace_id : null

  const otherProjects = useQuery({
    queryKey: qk.projects(otherId ?? 'running-other'),
    enabled: Boolean(otherId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('workspace_id', otherId!)
        .order('name')
      if (error) throw error
      return ((data ?? []) as Project[]).filter((project) => !project.archived)
    },
  })

  const otherActivities = useQuery({
    queryKey: qk.activities(otherId ?? 'running-other'),
    enabled: Boolean(otherId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('workspace_id', otherId!)
        .order('name')
      if (error) throw error
      return (data ?? []) as Activity[]
    },
  })

  const otherClients = useQuery({
    queryKey: qk.clients(otherId ?? 'running-other'),
    enabled: Boolean(otherId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('workspace_id', otherId!)
        .order('name')
      if (error) throw error
      return (data ?? []) as Client[]
    },
  })

  const otherProjectClients = useQuery({
    queryKey: qk.projectClients(otherId ?? 'running-other'),
    enabled: Boolean(otherId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_clients')
        .select('*, client:clients(*)')
        .eq('workspace_id', otherId!)
      if (error) throw error
      return (data ?? []) as ProjectClient[]
    },
  })

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.running })
    void qc.invalidateQueries({ queryKey: ['entries'] })
  }

  const stop = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('stop_running_timer')
      if (error) throw error
    },
    onSuccess: refresh,
  })

  const describe = useMutation({
    mutationFn: (input: { id: string; description: string }) => updateEntryDescription(input.id, input.description),
    onSuccess: refresh,
  })

  const assignRunning = useMutation({
    mutationFn: (input: {
      projectId: string
      activityId: string
      clientIds: string[]
      description: string
      billable: boolean
    }) => {
      if (!running) throw new Error('No running timer')
      return updateRunningEntry({
        id: running.id,
        workspaceId: running.workspace_id,
        projectId: input.projectId || null,
        description: input.description,
        billable: input.billable,
        activityId: input.activityId || null,
        clientIds: input.clientIds,
      })
    },
    onSuccess: refresh,
  })

  if (!running) return null

  const elapsed = Math.floor((now - new Date(running.started_at).getTime()) / 1000)
  const workspaceName = workspaces.find((workspace) => workspace.id === running.workspace_id)?.name ?? 'Workspace'
  const projects = otherWorkspace ? (otherProjects.data ?? []) : catalog.projects
  const activities = otherWorkspace ? (otherActivities.data ?? []) : catalog.activities
  const clients = otherWorkspace ? (otherClients.data ?? []) : catalog.clients
  const projectClients = otherWorkspace ? (otherProjectClients.data ?? []) : catalog.projectClients

  return (
    <div className="sticky top-0 z-20">
    <div className="flex items-center gap-2 border-b border-border bg-accent/70 px-4 py-3 text-sm backdrop-blur-md md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {otherWorkspace ? (
          <span className="inline-flex h-9 max-w-40 shrink-0 items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2.5 text-sm">
            <Buildings aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">{workspaceName}</span>
          </span>
        ) : null}
        <EntryMetaChips
          workspaceId={running.workspace_id}
          projectId={running.project_id ?? ''}
          activityId={running.activity_id ?? ''}
          clientIds={running.time_entry_clients?.map((row) => row.client_id) ?? []}
          description={running.description}
          billable={running.billable}
          projects={projects}
          activities={activities}
          clients={clients}
          projectClients={projectClients}
          onChange={(next) => assignRunning.mutate(next)}
        />
        <input
          key={`${running.id}:${running.description}`}
          aria-label="Description"
          defaultValue={running.description}
          placeholder="Description"
          className="h-9 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none transition-colors duration-75 hover:bg-muted placeholder:text-muted-foreground"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
          onBlur={(event) => {
            if (event.target.value !== running.description) {
              describe.mutate({ id: running.id, description: event.target.value })
            }
          }}
        />
      </div>
      <span className="tabular shrink-0 font-semibold">{formatDuration(elapsed)}</span>
      <Button variant="outline" onClick={() => stop.mutate()} disabled={stop.isPending}>
        <Pause aria-hidden="true" />
        Stop
      </Button>
    </div>
    <div className="pointer-events-none h-4 md:h-6" aria-hidden="true" />
    </div>
  )
}
