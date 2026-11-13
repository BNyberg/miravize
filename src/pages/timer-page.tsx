import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, PlayIcon, StopIcon } from '@heroicons/react/24/outline'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addDays,
  addWeeks,
  eachDayOfInterval,
  format,
  getISOWeek,
  isSameWeek,
  isToday,
  startOfDay,
  startOfWeek,
} from 'date-fns'
import { useEffect, useMemo, useState } from 'react'

import { EntryEditor, EntryMetaChips, clientMode, type Draft, type EntrySaveInput } from '@/components/timer/entry-editor'
import { WeekGrid } from '@/components/timer/week-grid'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/features/auth/auth-context'
import { useCatalog } from '@/features/projects/use-catalog'
import { useNow } from '@/features/timer/use-now'
import { useRunningTimer } from '@/features/timer/use-running-timer'
import { ALL_WORKSPACES, useWorkspace } from '@/features/workspaces/workspace-context'
import { qk } from '@/lib/query-keys'
import { formatDuration } from '@/lib/splits'
import { supabase } from '@/lib/supabase'
import {
  ENTRY_SELECT,
  createEntry,
  deleteEntry,
  startTimer,
  stopTimer,
  updateEntry,
  updateEntryDescription,
  updateEntrySpan,
  updateRunningEntry,
} from '@/lib/timer'
import { cn } from '@/lib/utils'
import type { TimeEntry } from '@/types'

function useNarrow() {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)')
    const apply = () => setNarrow(query.matches)
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])
  return narrow
}

export function TimerPage() {
  const { user } = useAuth()
  const { workspaceId, isAll, workspaces } = useWorkspace()
  const catalog = useCatalog()
  const narrow = useNarrow()
  const [anchor, setAnchor] = useState(() => new Date())
  const [span, setSpan] = useState<1 | 5 | 7>(5)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [quickFilter, setQuickFilter] = useState('')
  const qc = useQueryClient()
  const { data: running } = useRunningTimer()
  const now = useNow(Boolean(running))

  const dayView = narrow || span === 1
  const count = dayView ? 1 : span
  const rangeStart = dayView ? startOfDay(anchor) : startOfWeek(anchor, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: rangeStart, end: addDays(rangeStart, count - 1) })
  const rangeEnd = addDays(rangeStart, count)

  const entries = useQuery({
    queryKey: qk.entries(workspaceId, `${rangeStart.toISOString()}-${count}-${user?.id ?? ''}`),
    enabled: Boolean(user),
    queryFn: async () => {
      let query = supabase
        .from('time_entries')
        .select(ENTRY_SELECT)
        .eq('user_id', user!.id)
        .gte('started_at', rangeStart.toISOString())
        .lt('started_at', rangeEnd.toISOString())
        .order('started_at', { ascending: true })
      if (!isAll) query = query.eq('workspace_id', workspaceId)
      const { data, error: err } = await query
      if (err) throw err
      return (data ?? []) as TimeEntry[]
    },
  })

  const blocks = useMemo(() => {
    const unique = new Map<string, TimeEntry>()
    for (const entry of entries.data ?? []) unique.set(entry.id, entry)
    if (running && !unique.has(running.id)) unique.set(running.id, running)
    return [...unique.values()]
  }, [entries.data, running])

  const elapsed = running ? Math.floor((now - new Date(running.started_at).getTime()) / 1000) : 0
  const defaultWorkspace = isAll ? (workspaces[0]?.id ?? '') : workspaceId

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['entries'] })
    await qc.invalidateQueries({ queryKey: qk.running })
  }

  async function persistEntry(input: EntrySaveInput) {
    if (input.mode === 'start') {
      await startTimer({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        description: input.description,
        billable: input.billable,
        tagIds: input.tagIds,
        source: 'manual',
        activityId: input.activityId,
        clientIds: input.clientIds,
      })
      return
    }
    if (!input.start || !input.end) return
    if (input.mode === 'create') {
      await createEntry({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        description: input.description,
        billable: input.billable,
        tagIds: input.tagIds,
        startedAt: input.start,
        stoppedAt: input.end,
        activityId: input.activityId,
        clientIds: input.clientIds,
      })
      return
    }
    if (!input.id) return
    await updateEntry({
      id: input.id,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      description: input.description,
      billable: input.billable,
      tagIds: input.tagIds,
      startedAt: input.start,
      stoppedAt: input.end,
      activityId: input.activityId,
      clientIds: input.clientIds,
    })
  }

  const save = useMutation({
    mutationFn: persistEntry,
    onSuccess: async () => {
      setDraft(null)
      setError(null)
      await refresh()
    },
    onError: (err: Error) => setError(err.message),
  })

  const move = useMutation({
    mutationFn: (input: { id: string; start: Date; end: Date }) => updateEntrySpan(input.id, input.start, input.end),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  })

  const remove = useMutation({
    mutationFn: deleteEntry,
    onSuccess: async () => {
      setDraft(null)
      await refresh()
    },
    onError: (err: Error) => setError(err.message),
  })

  const stop = useMutation({
    mutationFn: stopTimer,
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  })

  const describe = useMutation({
    mutationFn: (input: { id: string; description: string }) => updateEntryDescription(input.id, input.description),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
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
    onError: (err: Error) => setError(err.message),
  })

  const quickStart = useMutation({
    mutationFn: (input: {
      workspaceId: string
      projectId: string | null
      billable: boolean
      description: string
      activityId?: string | null
      clientIds?: string[]
    }) =>
      startTimer({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        description: input.description,
        billable: input.billable,
        tagIds: [],
        source: 'quick_start',
        activityId: input.activityId,
        clientIds: input.clientIds,
      }),
    onSuccess: async () => {
      setError(null)
      await refresh()
    },
    onError: (err: Error) => setError(err.message),
  })

  function openDraft(next: Draft) {
    requestAnimationFrame(() => setDraft(next))
  }

  const weekNumber = getISOWeek(rangeStart)
  const label = dayView
    ? `${isToday(rangeStart) ? 'Today · ' : ''}${format(rangeStart, 'EEE d MMM')}`
    : isSameWeek(rangeStart, new Date(), { weekStartsOn: 1 })
      ? `This week · W${weekNumber}`
      : `${format(rangeStart, 'd MMM')} – ${format(days[days.length - 1]!, 'd MMM')} · W${weekNumber}`

  const quickProjects = catalog.projects.filter((project) => (isAll ? true : project.workspace_id === workspaceId))
  const quickActivityGroups = (() => {
    const rows = catalog.activities.flatMap((activity) => {
      const project = quickProjects.find((item) => item.id === activity.project_id)
      if (!project) return []
      const client = activity.client_id ? catalog.clients.find((item) => item.id === activity.client_id) : null
      return [{ activity, project, client }]
    })
    const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })
    rows.sort((a, b) => byName(a.project.name, b.project.name) || byName(a.activity.name, b.activity.name))
    const named = new Map<string, { id: string; name: string; rows: typeof rows }>()
    const unassigned: typeof rows = []
    for (const row of rows) {
      if (!row.client) {
        unassigned.push(row)
        continue
      }
      const group = named.get(row.client.id) ?? { id: row.client.id, name: row.client.name, rows: [] }
      group.rows.push(row)
      named.set(row.client.id, group)
    }
    const groups = [...named.values()].sort((a, b) => byName(a.name, b.name))
    if (unassigned.length > 0) groups.push({ id: 'unassigned', name: '', rows: unassigned })
    return groups
  })()
  const quickQuery = quickFilter.trim().toLowerCase()
  const quickMatches = (value: string) => !quickQuery || value.toLowerCase().includes(quickQuery)
  const visibleProjects = quickProjects.filter((project) => quickMatches(project.name))
  const visibleActivityGroups = quickActivityGroups
    .map((group) => ({ ...group, rows: group.rows.filter((row) => quickMatches(row.activity.name)) }))
    .filter((group) => group.rows.length > 0)
  const showProjectSection = quickQuery ? visibleProjects.length > 0 : true
  const showActivitySection = visibleActivityGroups.length > 0
  const quickNoMatches = Boolean(quickQuery) && !showProjectSection && !showActivitySection

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">Timer</h1>
      {error ? (
        <div role="alert" className="mx-4 mt-3 border border-destructive/40 px-3 py-2 text-sm md:mx-6">
          {error}
        </div>
      ) : null}
      <div className="flex items-center gap-2 px-4 py-3 md:px-6">
        {narrow ? null : (
          <div className="flex h-9 overflow-hidden rounded-md border border-border">
            {(
              [
                [1, 'Day'],
                [5, '5'],
                [7, '7'],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                aria-pressed={span === value}
                className={cn(
                  'h-full px-3 text-sm',
                  span === value ? 'bg-foreground text-background' : 'text-muted-foreground',
                )}
                onClick={() => setSpan(value)}
              >
                {text}
              </button>
            ))}
          </div>
        )}
        <Button
          variant="outline"
          size="icon"
          aria-label={dayView ? 'Previous day' : 'Previous week'}
          onClick={() => setAnchor((current) => (dayView ? addDays(current, -1) : addWeeks(current, -1)))}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <Button variant="outline" onClick={() => setAnchor(new Date())}>
          Today
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={dayView ? 'Next day' : 'Next week'}
          onClick={() => setAnchor((current) => (dayView ? addDays(current, 1) : addWeeks(current, 1)))}
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
        <p className="shrink-0 text-sm">{label}</p>
        {running ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
            <EntryMetaChips
              workspaceId={running.workspace_id}
              projectId={running.project_id ?? ''}
              activityId={running.activity_id ?? ''}
              clientIds={running.time_entry_clients?.map((row) => row.client_id) ?? []}
              description={running.description}
              billable={running.billable}
              projects={catalog.projects}
              activities={catalog.activities}
              clients={catalog.clients}
              projectClients={catalog.projectClients}
              onChange={(next) => assignRunning.mutate(next)}
            />
            <input
              key={`${running.id}:${running.description}`}
              aria-label="Description"
              defaultValue={running.description}
              placeholder="Description"
              className="h-8 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none transition-colors duration-75 hover:bg-muted placeholder:text-muted-foreground"
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
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {running ? <span className="font-mono text-sm tabular-nums">{formatDuration(elapsed)}</span> : null}
          {running ? (
            <Button onClick={() => stop.mutate()} disabled={stop.isPending}>
              <StopIcon aria-hidden="true" />
              Stop
            </Button>
          ) : (
            <div className="flex">
              <Button
                className="rounded-r-none"
                disabled={isAll || quickStart.isPending}
                onClick={() =>
                  quickStart.mutate({
                    workspaceId,
                    projectId: null,
                    billable: true,
                    description: '',
                  })
                }
              >
                <PlayIcon aria-hidden="true" />
                Start
              </Button>
              <DropdownMenu onOpenChange={(open) => { if (!open) setQuickFilter('') }}>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="rounded-l-none border-l border-primary-foreground/30 px-2"
                    aria-label="Quick start"
                    disabled={quickStart.isPending}
                  >
                    <ChevronDownIcon aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="flex max-h-96 w-64 flex-col overflow-hidden p-0">
                <div className="border-b border-border p-1">
                  <input
                    value={quickFilter}
                    onChange={(event) => setQuickFilter(event.target.value)}
                    placeholder="Filter"
                    aria-label="Filter"
                    autoFocus
                    className="h-8 w-full rounded-md bg-transparent px-2 text-sm outline-none transition-colors duration-75 hover:bg-muted placeholder:text-muted-foreground"
                    onKeyDown={(event) => {
                      if (event.key !== 'Escape') event.stopPropagation()
                    }}
                  />
                </div>
                <div className="min-h-0 max-h-[21.5rem] flex-1 overflow-y-auto p-1">
                {quickNoMatches ? (
                  <DropdownMenuItem disabled>No matches</DropdownMenuItem>
                ) : null}
                {showProjectSection ? (
                  <>
                    <DropdownMenuLabel>Projects</DropdownMenuLabel>
                    {visibleProjects.length === 0 ? (
                      <DropdownMenuItem disabled>No projects yet</DropdownMenuItem>
                    ) : (
                      visibleProjects.map((project) => (
                        <DropdownMenuItem
                          key={project.id}
                          onSelect={() =>
                            quickStart.mutate({
                              workspaceId: project.workspace_id,
                              projectId: project.id,
                              billable: project.billable,
                              description: '',
                            })
                          }
                        >
                          <span className="size-2 shrink-0" style={{ background: project.color }} aria-hidden="true" />
                          {project.name}
                        </DropdownMenuItem>
                      ))
                    )}
                  </>
                ) : null}
                {showActivitySection ? (
                  <>
                    {showProjectSection ? <DropdownMenuSeparator /> : null}
                    {visibleActivityGroups.map((group) => (
                      <DropdownMenuGroup key={group.id}>
                        {group.name ? <DropdownMenuLabel>{group.name}</DropdownMenuLabel> : null}
                        {group.rows.map(({ activity, project }) => (
                          <DropdownMenuItem
                            key={activity.id}
                            onSelect={() => {
                              const links = catalog.projectClients.filter((row) => row.project_id === project.id)
                              const clientIds =
                                clientMode(links) === 'manual' && activity.client_id ? [activity.client_id] : []
                              quickStart.mutate({
                                workspaceId: project.workspace_id,
                                projectId: project.id,
                                billable: project.billable,
                                description: '',
                                activityId: activity.id,
                                clientIds,
                              })
                            }}
                          >
                            <span className="size-2 shrink-0" style={{ background: project.color }} aria-hidden="true" />
                            <span className="min-w-0 truncate">{activity.name}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    ))}
                  </>
                ) : null}
                </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>
      <WeekStrip entries={blocks} start={rangeStart} end={rangeEnd} now={now} />
      <WeekGrid
        days={days}
        entries={blocks}
        now={now}
        clients={catalog.clients}
        projectClients={catalog.projectClients}
        onCreate={(start, end, point) =>
          openDraft({
            mode: 'create',
            workspaceId: defaultWorkspace === ALL_WORKSPACES ? '' : defaultWorkspace,
            start,
            end,
            point,
          })
        }
        onMove={(id, start, end) => move.mutate({ id, start, end })}
        onDescribe={(id, description) => describe.mutate({ id, description })}
        onEdit={(entry, point) => {
          if (!entry.stopped_at) return
          openDraft({
            mode: 'edit',
            entry,
            workspaceId: entry.workspace_id,
            start: new Date(entry.started_at),
            end: new Date(entry.stopped_at),
            point,
          })
        }}
      />
      <EntryEditor
        draft={draft}
        workspaces={workspaces}
        showWorkspace={isAll}
        projects={catalog.projects}
        activities={catalog.activities}
        clients={catalog.clients}
        projectClients={catalog.projectClients}
        pending={save.isPending || remove.isPending}
        onClose={() => setDraft(null)}
        onSave={(input) => save.mutate(input)}
        onPatch={async (input) => {
          await persistEntry(input)
          await refresh()
        }}
        onDelete={(id) => remove.mutate(id)}
      />
    </div>
  )
}

function formatSpan(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

function WeekStrip({
  entries,
  start,
  end,
  now,
}: {
  entries: TimeEntry[]
  start: Date
  end: Date
  now: number
}) {
  const rangeStart = start.getTime()
  const rangeEnd = end.getTime()
  const byProject = new Map<string, { id: string; name: string; color: string; seconds: number }>()
  for (const entry of entries) {
    const entryStart = new Date(entry.started_at).getTime()
    const entryEnd = entry.stopped_at ? new Date(entry.stopped_at).getTime() : now
    const seconds = Math.max(0, Math.min(entryEnd, rangeEnd) - Math.max(entryStart, rangeStart)) / 1000
    if (seconds <= 0) continue
    const id = entry.project_id ?? 'unassigned'
    const current = byProject.get(id)
    if (current) current.seconds += seconds
    else {
      byProject.set(id, {
        id,
        name: entry.project?.name ?? 'Project',
        color: entry.project?.color || '#5E5C57',
        seconds,
      })
    }
  }
  const shares = [...byProject.values()].sort((a, b) => b.seconds - a.seconds)
  const total = shares.reduce((sum, row) => sum + row.seconds, 0)
  let acc = 0
  const placed = shares.map((share) => {
    const width = total > 0 ? (share.seconds / total) * 100 : 0
    const left = acc
    acc += width
    return { ...share, width, left }
  })
  return (
    <div className="flex items-center gap-3 px-4 pb-3 md:px-6">
      <div className="relative h-4 min-w-0 flex-1">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-sm bg-muted">
          {placed.map((share) => (
            <span
              key={share.id}
              className="absolute inset-y-0"
              style={{
                left: `${share.left}%`,
                width: `${Math.max(share.width, 0.4)}%`,
                background: share.color,
              }}
            />
          ))}
        </div>
        {placed.map((share) => {
          const duration = formatSpan(share.seconds)
          return (
            <Tooltip key={share.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`${share.name} ${duration}`}
                  className="absolute top-1/2 h-4 -translate-y-1/2"
                  style={{ left: `${share.left}%`, width: `${Math.max(share.width, 0.4)}%` }}
                />
              </TooltipTrigger>
              <TooltipContent side="top">
                <span className="flex items-center gap-2">
                  <span className="size-2 shrink-0 rounded-sm" style={{ background: share.color }} aria-hidden="true" />
                  <span>{share.name}</span>
                  <span className="font-mono tabular-nums">{duration}</span>
                </span>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
      <p className="shrink-0 font-mono text-xs tabular-nums">{formatSpan(total)}</p>
    </div>
  )
}
