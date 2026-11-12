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
import { useEffect, useMemo, useRef, useState } from 'react'

import { EntryEditor, type Draft } from '@/components/timer/entry-editor'
import { WeekGrid } from '@/components/timer/week-grid'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
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
  createEntry,
  deleteEntry,
  startTimer,
  stopTimer,
  updateEntry,
  updateEntryDescription,
  updateEntrySpan,
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
  const startButton = useRef<HTMLButtonElement>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
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
        .select('*, project:projects(*), time_entry_tags(tag_id, tags(*))')
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
    const list = entries.data ?? []
    if (!running) return list
    return list.some((entry) => entry.id === running.id) ? list : [running, ...list]
  }, [entries.data, running])

  const elapsed = running ? Math.floor((now - new Date(running.started_at).getTime()) / 1000) : 0
  const defaultWorkspace = isAll ? (workspaces[0]?.id ?? '') : workspaceId

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['entries'] })
    await qc.invalidateQueries({ queryKey: qk.running })
  }

  const save = useMutation({
    mutationFn: async (input: {
      mode: Draft['mode']
      id?: string
      workspaceId: string
      projectId: string
      description: string
      billable: boolean
      tagIds: string[]
      start?: Date
      end?: Date
    }) => {
      if (input.mode === 'start') {
        await startTimer({
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          description: input.description,
          billable: input.billable,
          tagIds: input.tagIds,
          source: 'manual',
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
      })
    },
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

  const quickStart = useMutation({
    mutationFn: (input: { workspaceId: string; projectId: string; billable: boolean; tagIds: string[] }) =>
      startTimer({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        description: '',
        billable: input.billable,
        tagIds: input.tagIds,
        source: 'quick_start',
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
  const tagUses = new Map<string, number>()
  for (const link of catalog.projectTags) {
    if (quickProjects.some((project) => project.id === link.project_id)) {
      tagUses.set(link.tag_id, (tagUses.get(link.tag_id) ?? 0) + 1)
    }
  }
  const quickTags = catalog.projectTags.flatMap((link) => {
    const project = quickProjects.find((item) => item.id === link.project_id)
    const tag = catalog.tags.find((item) => item.id === link.tag_id)
    if (!project || !tag) return []
    const shared = (tagUses.get(tag.id) ?? 0) > 1
    return [{ project, tag, label: shared ? `${project.name} · ${tag.name}` : tag.name }]
  })

  function openStart(point: { x: number; y: number }) {
    openDraft({
      mode: 'start',
      workspaceId: defaultWorkspace === ALL_WORKSPACES ? '' : defaultWorkspace,
      point,
    })
  }

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
            <span className="inline-flex max-w-[40%] shrink-0 items-center gap-1.5 truncate border border-border px-2 py-1 text-sm">
              <span
                className="size-2 shrink-0"
                style={{ background: running.project?.color || '#5E5C57' }}
                aria-hidden="true" />
              <span className="truncate">{running.project?.name ?? 'Project'}</span>
            </span>
            <input
              key={`${running.id}:${running.description}`}
              aria-label="Description"
              defaultValue={running.description}
              placeholder="Description"
              className="h-8 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
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
                ref={startButton}
                className="rounded-r-none"
                onClick={() => {
                  const rect = startButton.current?.getBoundingClientRect()
                  openStart({ x: rect?.left ?? 0, y: rect?.bottom ?? 0 })
                }}
              >
                <PlayIcon aria-hidden="true" />
                Start
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="rounded-l-none border-l border-primary-foreground/30 px-2"
                    aria-label="Quick start"
                    disabled={quickStart.isPending}
                  >
                    <ChevronDownIcon aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
                <DropdownMenuLabel>Projects</DropdownMenuLabel>
                {quickProjects.length === 0 ? (
                  <DropdownMenuItem disabled>No projects yet</DropdownMenuItem>
                ) : (
                  quickProjects.map((project) => (
                    <DropdownMenuItem
                      key={project.id}
                      onSelect={() =>
                        quickStart.mutate({
                          workspaceId: project.workspace_id,
                          projectId: project.id,
                          billable: project.billable,
                          tagIds: [],
                        })
                      }
                    >
                      <span className="size-2 shrink-0" style={{ background: project.color }} aria-hidden="true" />
                      {project.name}
                    </DropdownMenuItem>
                  ))
                )}
                {quickTags.length > 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Tags</DropdownMenuLabel>
                    {quickTags.map(({ project, tag, label: tagLabel }) => (
                      <DropdownMenuItem
                        key={`${project.id}-${tag.id}`}
                        onSelect={() =>
                          quickStart.mutate({
                            workspaceId: project.workspace_id,
                            projectId: project.id,
                            billable: project.billable,
                            tagIds: [tag.id],
                          })
                        }
                      >
                        <span className="size-2 shrink-0" style={{ background: project.color }} aria-hidden="true" />
                        {tagLabel}
                      </DropdownMenuItem>
                    ))}
                  </>
                ) : null}
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
        tags={catalog.tags}
        pending={save.isPending || remove.isPending}
        onClose={() => setDraft(null)}
        onSave={(input) => save.mutate(input)}
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
  const span = end.getTime() - start.getTime()
  const total = entries.reduce((sum, entry) => {
    const entryStart = new Date(entry.started_at).getTime()
    const entryEnd = entry.stopped_at ? new Date(entry.stopped_at).getTime() : now
    return sum + Math.max(0, entryEnd - Math.max(entryStart, start.getTime())) / 1000
  }, 0)
  return (
    <div className="flex items-center gap-3 px-4 pb-3 md:px-6">
      <div className="relative h-2 min-w-0 flex-1 bg-muted" aria-hidden="true">
        {entries.map((entry) => {
          const entryStart = new Date(entry.started_at).getTime()
          const entryEnd = entry.stopped_at ? new Date(entry.stopped_at).getTime() : now
          const left = ((Math.max(entryStart, start.getTime()) - start.getTime()) / span) * 100
          const width = ((Math.min(entryEnd, end.getTime()) - Math.max(entryStart, start.getTime())) / span) * 100
          if (width <= 0) return null
          return (
            <span
              key={entry.id}
              className="absolute inset-y-0"
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 0.4)}%`,
                background: entry.project?.color || '#5E5C57',
              }}
            />
          )
        })}
      </div>
      <p className="shrink-0 font-mono text-xs tabular-nums">{formatSpan(total)}</p>
    </div>
  )
}
