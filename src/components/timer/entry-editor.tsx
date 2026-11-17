import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline'
import { useQuery } from '@tanstack/react-query'
import { addDays, format } from 'date-fns'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { TimeField } from '@/components/ui/time-field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { qk } from '@/lib/query-keys'
import { requestCode } from '@/lib/request-code'
import { taskCode } from '@/lib/task-code'
import { formatDuration } from '@/lib/splits'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { Activity, Client, Project, ProjectClient, TaskStatus, TimeEntry } from '@/types'

type Point = { x: number; y: number }

type Draft = {
  mode: 'create' | 'edit' | 'start'
  entry?: TimeEntry
  workspaceId: string
  start?: Date
  end?: Date
  point: Point
}

export type EntrySaveInput = {
  mode: Draft['mode']
  id?: string
  workspaceId: string
  projectId: string
  description: string
  billable: boolean
  tagIds: string[]
  activityId: string | null
  clientIds: string[]
  requestIds: string[]
  taskIds: string[]
  start?: Date
  end?: Date
}

type Fields = {
  workspaceId: string
  projectId: string
  description: string
  billable: boolean
  activityId: string
  clientIds: string[]
  requestIds: string[]
  taskIds: string[]
  start: Date | null
  end: Date | null
}

function atTime(day: Date, hhmm: string) {
  const [hours, minutes] = hhmm.split(':').map(Number)
  const next = new Date(day)
  next.setHours(hours || 0, minutes || 0, 0, 0)
  return next
}

function spanFrom(day: Date, startHHmm: string, endHHmm: string) {
  const start = atTime(day, startHHmm)
  let end = atTime(day, endHHmm)
  if (end.getTime() <= start.getTime()) end = addDays(end, 1)
  return { start, end }
}

function insidePicker(event: { target: EventTarget | null }) {
  return event.target instanceof Element && Boolean(event.target.closest('[data-radix-popper-content-wrapper]'))
}

function clientMode(links: ProjectClient[]) {
  if (links.length === 0) return 'none' as const
  if (links.every((row) => row.split_percent == null)) return 'manual' as const
  return 'auto' as const
}

function Chip({
  label,
  empty,
  color,
  className,
}: {
  label: string
  empty?: boolean
  color?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border px-2.5 text-sm',
        empty ? 'border-dashed border-border text-muted-foreground' : 'border-border bg-muted/60',
        className,
      )}
    >
      {color ? <span className="size-2 shrink-0 rounded-sm" style={{ background: color }} aria-hidden="true" /> : null}
      <span className="truncate">{label}</span>
    </span>
  )
}

function EntryMetaChips({
  workspaceId,
  projectId,
  activityId,
  clientIds,
  requestIds,
  taskIds,
  description,
  billable,
  projects,
  activities,
  clients,
  projectClients,
  stacked = false,
  onChange,
}: {
  workspaceId: string
  projectId: string
  activityId: string
  clientIds: string[]
  requestIds: string[]
  taskIds: string[]
  description: string
  billable: boolean
  projects: Project[]
  activities: Activity[]
  clients: Client[]
  projectClients: ProjectClient[]
  stacked?: boolean
  onChange: (next: {
    workspaceId: string
    projectId: string
    activityId: string
    clientIds: string[]
    requestIds: string[]
  taskIds: string[]
    description: string
    billable: boolean
  }) => void
}) {
  const project = projects.find((item) => item.id === projectId)
  const scopeWorkspaceId = project?.workspace_id || workspaceId
  const links = projectClients.filter((row) => row.project_id === projectId)
  const mode = clientMode(links)
  const projectActivities = activities.filter((row) => row.project_id === projectId)
  const activity = projectActivities.find((row) => row.id === activityId)
  const linkedClients = links
    .map((row) => clients.find((item) => item.id === row.client_id))
    .filter((item): item is Client => Boolean(item))
  const workspaceRequests = useQuery({
    queryKey: qk.requests(`${scopeWorkspaceId}-picker`),
    enabled: Boolean(scopeWorkspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('requests')
        .select('id, task_number, request, status')
        .eq('workspace_id', scopeWorkspaceId)
        .order('logged_on', { ascending: false })
        .order('task_number', { ascending: false })
      if (error) throw error
      return (data ?? []) as { id: string; task_number: number; request: string; status: TaskStatus }[]
    },
  })
  const requestRows = workspaceRequests.data ?? []
  const openRequestRows = requestRows.filter((row) => row.status !== 'done')
  const doneRequestRows = requestRows.filter((row) => row.status === 'done')
  const workspaceTasks = useQuery({
    queryKey: qk.tasks(`${scopeWorkspaceId}-picker`),
    enabled: Boolean(scopeWorkspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, task_number, task, status')
        .eq('workspace_id', scopeWorkspaceId)
        .order('logged_on', { ascending: false })
        .order('task_number', { ascending: false })
      if (error) throw error
      return (data ?? []) as { id: string; task_number: number; task: string; status: TaskStatus }[]
    },
  })
  const taskRows = workspaceTasks.data ?? []
  const openTaskRows = taskRows.filter((row) => row.status !== 'done')
  const doneTaskRows = taskRows.filter((row) => row.status === 'done')

  function requestIdLabel(row: { task_number: number }) {
    return requestCode(row.task_number)
  }

  function requestMenuLabel(row: { task_number: number; status: TaskStatus; request: string }) {
    const status = row.status === 'doing' ? 'Doing' : row.status === 'done' ? 'Done' : 'Todo'
    return `${requestIdLabel(row)} · ${status} · ${row.request}`
  }

  const linkedRequests = requestIds
    .map((id) => requestRows.find((row) => row.id === id))
    .filter((row): row is { id: string; task_number: number; request: string; status: TaskStatus } => Boolean(row))
  const linkedTasks = taskIds
    .map((id) => taskRows.find((row) => row.id === id))
    .filter((row): row is { id: string; task_number: number; task: string; status: TaskStatus } => Boolean(row))

  function taskMenuLabel(row: { task_number: number; status: TaskStatus; task: string }) {
    const status = row.status === 'doing' ? 'Doing' : row.status === 'done' ? 'Done' : 'Todo'
    return `${taskCode(row.task_number)} · ${status} · ${row.task}`
  }

  function toggleTask(taskId: string, checked: boolean) {
    const nextTasks = checked ? taskIds.filter((id) => id !== taskId) : [...taskIds, taskId]
    onChange({ workspaceId: scopeWorkspaceId, projectId, activityId, clientIds, requestIds, taskIds: nextTasks, description, billable })
  }

  function applyProject(nextProjectId: string) {
    const nextProject = projects.find((item) => item.id === nextProjectId)
    const nextLinks = projectClients.filter((row) => row.project_id === nextProjectId)
    const nextMode = clientMode(nextLinks)
    const keptActivity = activities.find((row) => row.id === activityId && row.project_id === nextProjectId)
    const defaultActivity = activities.find(
      (row) => row.project_id === nextProjectId && row.client_id == null && row.is_default,
    )
    const allowed = new Set(nextLinks.map((row) => row.client_id))
    onChange({
      workspaceId: nextProject?.workspace_id ?? workspaceId,
      projectId: nextProjectId,
      billable: nextProject?.billable ?? billable,
      activityId: keptActivity?.id ?? defaultActivity?.id ?? '',
      clientIds: nextMode === 'manual' ? clientIds.filter((id) => allowed.has(id)) : [],
      requestIds,
  taskIds,
      description,
    })
  }

  function applyActivity(nextActivityId: string) {
    const nextActivity = projectActivities.find((row) => row.id === nextActivityId)
    let nextClients = clientIds
    if (mode === 'manual' && nextActivity?.client_id && !nextClients.includes(nextActivity.client_id)) {
      nextClients = [...nextClients, nextActivity.client_id]
    }
    onChange({
      workspaceId: scopeWorkspaceId,
      projectId,
      activityId: nextActivityId,
      clientIds: nextClients,
      requestIds,
  taskIds,
      description,
      billable,
    })
  }

  return (
    <div className={cn('flex min-w-0 gap-1.5', stacked ? 'flex-col' : 'flex-wrap')}>
    <div className="flex min-w-0 flex-wrap gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button">
            <Chip label={project?.name ?? 'Project'} empty={!project} color={project?.color} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {projects.map((item) => (
            <DropdownMenuItem key={item.id} onSelect={() => applyProject(item.id)}>
              <span className="size-2 shrink-0 rounded-sm" style={{ background: item.color }} aria-hidden="true" />
              {item.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {projectActivities.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button">
              <Chip label={activity?.name ?? 'Activity'} empty={!activity} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {activity ? (
              <DropdownMenuItem
                onSelect={() =>
                  onChange({ workspaceId: scopeWorkspaceId, projectId, activityId: '', clientIds, requestIds,
  taskIds, description, billable })
                }
              >
                Clear activity
              </DropdownMenuItem>
            ) : null}
            {projectActivities.map((item) => (
              <DropdownMenuItem key={item.id} onSelect={() => applyActivity(item.id)}>
                {item.name}
                {item.client_id ? ` · ${clients.find((client) => client.id === item.client_id)?.name ?? ''}` : ''}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {mode === 'manual' ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button">
              <Chip
                label={
                  clientIds.length === 0
                    ? 'Client'
                    : clientIds
                        .map((id) => linkedClients.find((item) => item.id === id)?.name)
                        .filter(Boolean)
                        .join(', ')
                }
                empty={clientIds.length === 0}
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {linkedClients.map((item) => {
              const checked = clientIds.includes(item.id)
              return (
                <DropdownMenuItem
                  key={item.id}
                  onSelect={(event) => {
                    event.preventDefault()
                    const nextClients = checked ? clientIds.filter((id) => id !== item.id) : [...clientIds, item.id]
                    onChange({ workspaceId: scopeWorkspaceId, projectId, activityId, clientIds: nextClients, requestIds,
  taskIds, description, billable })
                  }}
                >
                  <span className={cn('mr-2 font-mono text-xs', checked ? 'opacity-100' : 'opacity-30')}>
                    {checked ? '✓' : '○'}
                  </span>
                  {item.name}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {mode === 'auto' ? (
        <Chip
          label={linkedClients.map((item) => item.name).join(', ') || 'Split clients'}
          className="pointer-events-none opacity-80"
        />
      ) : null}
      </div>
      <div className="flex min-w-0 flex-wrap gap-1.5">
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button type="button">
                <Chip
                  className="max-w-64"
                  label={
                    linkedRequests.length === 0
                      ? 'Requests'
                      : linkedRequests.map(requestIdLabel).join(', ')
                  }
                  empty={requestIds.length === 0}
                />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          {linkedRequests.length > 0 ? (
            <TooltipContent className="max-w-sm">
              {linkedRequests.length === 1 ? (
                linkedRequests[0]!.request
              ) : (
                <span className="block space-y-1">
                  {linkedRequests.map((row) => (
                    <span key={row.id} className="block">
                      {requestIdLabel(row)} · {row.request}
                    </span>
                  ))}
                </span>
              )}
            </TooltipContent>
          ) : null}
        </Tooltip>
        <DropdownMenuContent className="w-80">
          {requestRows.length === 0 ? (
            <DropdownMenuItem disabled>No requests</DropdownMenuItem>
          ) : (
            <>
              {openRequestRows.map((item) => {
                const checked = requestIds.includes(item.id)
                return (
                  <DropdownMenuItem
                    key={item.id}
                    className="min-w-0"
                    onSelect={(event) => {
                      event.preventDefault()
                      const nextRequests = checked ? requestIds.filter((id) => id !== item.id) : [...requestIds, item.id]
                      onChange({ workspaceId: scopeWorkspaceId, projectId, activityId, clientIds, requestIds: nextRequests, taskIds, description, billable })
                    }}
                  >
                    <span className={cn('mr-2 shrink-0 font-mono text-xs', checked ? 'opacity-100' : 'opacity-30')}>
                      {checked ? '✓' : '○'}
                    </span>
                    <span className="min-w-0 truncate">{requestMenuLabel(item)}</span>
                  </DropdownMenuItem>
                )
              })}
              {doneRequestRows.length > 0 ? (
                <>
                  {openRequestRows.length > 0 ? <DropdownMenuSeparator /> : null}
                  {doneRequestRows.map((item) => {
                    const checked = requestIds.includes(item.id)
                    return (
                      <DropdownMenuItem
                        key={item.id}
                        className="min-w-0 text-muted-foreground line-through"
                        onSelect={(event) => {
                          event.preventDefault()
                          const nextRequests = checked ? requestIds.filter((id) => id !== item.id) : [...requestIds, item.id]
                          onChange({ workspaceId: scopeWorkspaceId, projectId, activityId, clientIds, requestIds: nextRequests, taskIds, description, billable })
                        }}
                      >
                        <span className={cn('mr-2 shrink-0 font-mono text-xs no-underline', checked ? 'opacity-100' : 'opacity-30')}>
                          {checked ? '✓' : '○'}
                        </span>
                        <span className="min-w-0 truncate">{requestMenuLabel(item)}</span>
                      </DropdownMenuItem>
                    )
                  })}
                </>
              ) : null}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button type="button">
                <Chip
                  className="max-w-64"
                  label={linkedTasks.length === 0 ? 'Tasks' : linkedTasks.map((row) => taskCode(row.task_number)).join(', ')}
                  empty={taskIds.length === 0}
                />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          {linkedTasks.length > 0 ? (
            <TooltipContent className="max-w-sm">
              {linkedTasks.length === 1 ? (
                linkedTasks[0]!.task
              ) : (
                <span className="block space-y-1">
                  {linkedTasks.map((row) => (
                    <span key={row.id} className="block">
                      {taskCode(row.task_number)} · {row.task}
                    </span>
                  ))}
                </span>
              )}
            </TooltipContent>
          ) : null}
        </Tooltip>
        <DropdownMenuContent className="w-80">
          {taskRows.length === 0 ? (
            <DropdownMenuItem disabled>No tasks</DropdownMenuItem>
          ) : (
            <>
              {openTaskRows.map((item) => {
                const checked = taskIds.includes(item.id)
                return (
                  <DropdownMenuItem
                    key={item.id}
                    className="min-w-0"
                    onSelect={(event) => {
                      event.preventDefault()
                      toggleTask(item.id, checked)
                    }}
                  >
                    <span className={cn('mr-2 shrink-0 font-mono text-xs', checked ? 'opacity-100' : 'opacity-30')}>
                      {checked ? '✓' : '○'}
                    </span>
                    <span className="min-w-0 truncate">{taskMenuLabel(item)}</span>
                  </DropdownMenuItem>
                )
              })}
              {doneTaskRows.length > 0 ? (
                <>
                  {openTaskRows.length > 0 ? <DropdownMenuSeparator /> : null}
                  {doneTaskRows.map((item) => {
                    const checked = taskIds.includes(item.id)
                    return (
                      <DropdownMenuItem
                        key={item.id}
                        className="min-w-0 text-muted-foreground line-through"
                        onSelect={(event) => {
                          event.preventDefault()
                          toggleTask(item.id, checked)
                        }}
                      >
                        <span className={cn('mr-2 shrink-0 font-mono text-xs no-underline', checked ? 'opacity-100' : 'opacity-30')}>
                          {checked ? '✓' : '○'}
                        </span>
                        <span className="min-w-0 truncate">{taskMenuLabel(item)}</span>
                      </DropdownMenuItem>
                    )
                  })}
                </>
              ) : null}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
    </div>
  )
}

function EntryEditor({
  draft,
  projects,
  activities,
  clients,
  projectClients,
  pending,
  onClose,
  onSave,
  onPatch,
  onDelete,
  onContinue,
}: {
  draft: Draft | null
  projects: Project[]
  activities: Activity[]
  clients: Client[]
  projectClients: ProjectClient[]
  pending: boolean
  onClose: () => void
  onSave: (input: EntrySaveInput) => void
  onPatch: (input: EntrySaveInput) => Promise<void>
  onDelete?: (id: string) => void
  onContinue?: (input: {
    workspaceId: string
    projectId: string | null
    description: string
    billable: boolean
    activityId: string | null
    clientIds: string[]
    requestIds: string[]
    taskIds: string[]
  }) => void
}) {
  const [fields, setFields] = useState<Fields>({
    workspaceId: '',
    projectId: '',
    description: '',
    billable: true,
    activityId: '',
    clientIds: [],
    requestIds: [],
    taskIds: [],
    start: null,
    end: null,
  })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const snapshot = useRef<Fields>(fields)
  const saving = useRef(false)

  useEffect(() => {
    if (!draft) return
    const entry = draft.entry
    const next: Fields = {
      workspaceId: entry?.workspace_id || draft.workspaceId,
      projectId: entry?.project_id ?? '',
      description: entry?.description ?? '',
      billable: entry?.billable ?? true,
      activityId: entry?.activity_id ?? '',
      clientIds: entry?.time_entry_clients?.map((row) => row.client_id) ?? [],
      requestIds: entry?.time_entry_requests?.map((row) => row.request_id) ?? [],
      taskIds: entry?.time_entry_tasks?.map((row) => row.task_id) ?? [],
      start: draft.start ?? (entry ? new Date(entry.started_at) : null),
      end: draft.end ?? (entry?.stopped_at ? new Date(entry.stopped_at) : null),
    }
    setFields(next)
    snapshot.current = next
    setConfirmDelete(false)
  }, [draft])

  const label = draft?.mode === 'edit' ? 'Logged entry' : draft?.mode === 'start' ? 'Start timer' : 'New entry'
  const duration =
    fields.start && fields.end ? formatDuration(Math.max(0, Math.round((fields.end.getTime() - fields.start.getTime()) / 1000))) : null

  function payload(next: Fields): EntrySaveInput | null {
    if (!draft || !next.projectId) return null
    const nextMode = clientMode(projectClients.filter((row) => row.project_id === next.projectId))
    const workspaceId = projects.find((project) => project.id === next.projectId)?.workspace_id || next.workspaceId
    return {
      mode: draft.mode,
      id: draft.entry?.id,
      workspaceId,
      projectId: next.projectId,
      description: next.description,
      billable: next.billable,
      tagIds: [],
      activityId: next.activityId || null,
      clientIds: nextMode === 'manual' ? next.clientIds : [],
      requestIds: next.requestIds,
      taskIds: next.taskIds,
      start: next.start ?? undefined,
      end: next.end ?? undefined,
    }
  }

  async function commit(next: Fields) {
    if (draft?.mode !== 'edit' || !draft.entry) {
      setFields(next)
      return
    }
    const input = payload(next)
    if (!input) {
      setFields(next)
      return
    }
    const previous = snapshot.current
    setFields(next)
    saving.current = true
    try {
      await onPatch(input)
      snapshot.current = next
    } catch (err) {
      setFields(previous)
      toast({
        tone: 'error',
        title: 'Could not save entry',
        description: err instanceof Error ? err.message : 'Try again.',
      })
    } finally {
      saving.current = false
    }
  }

  const dateValue = fields.start ? format(fields.start, 'yyyy-MM-dd') : ''
  const startValue = fields.start ? format(fields.start, 'HH:mm') : ''
  const endValue = fields.end ? format(fields.end, 'HH:mm') : ''

  return (
    <>
      <Popover
        open={Boolean(draft)}
        onOpenChange={(open) => {
          if (!open && confirmDelete) return
          if (!open) onClose()
        }}
      >
        <PopoverAnchor asChild>
          <span
            className="pointer-events-none fixed size-0"
            style={draft ? { left: draft.point.x, top: draft.point.y } : undefined}
          />
        </PopoverAnchor>
        <PopoverContent
          aria-label={label}
          collisionPadding={12}
          className="w-[28rem] p-4"
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (confirmDelete || insidePicker(event)) event.preventDefault()
          }}
          onPointerDownOutside={(event) => {
            if (confirmDelete || insidePicker(event)) event.preventDefault()
          }}
          onFocusOutside={(event) => {
            if (confirmDelete || insidePicker(event)) event.preventDefault()
          }}
        >
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No projects yet. Add one in{' '}
              <Link to="/projects" className="underline underline-offset-2">
                Projects
              </Link>
              .
            </p>
          ) : (
            <div className="grid gap-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  {draft?.mode === 'edit' ? (
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Logged</p>
                  ) : <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Draft</p>}
                  <input
                    aria-label="Description"
                    className="w-full rounded-md bg-transparent text-base font-semibold outline-none transition-colors duration-75 hover:bg-muted placeholder:font-normal placeholder:text-muted-foreground"
                    value={fields.description}
                    placeholder={draft?.mode === 'edit' ? 'Description · Enter to save' : 'Description'}
                    onChange={(event) => setFields((current) => ({ ...current, description: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        setFields((current) => ({ ...current, description: snapshot.current.description }))
                        event.currentTarget.blur()
                      }
                      if (event.key !== 'Enter') return
                      event.preventDefault()
                      event.currentTarget.blur()
                      if (draft?.mode === 'edit') void commit({ ...fields, description: fields.description })
                    }}
                  />
                </div>
                {draft?.mode === 'edit' && draft.entry && onDelete ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label="More">
                        <EllipsisHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive"
                        onSelect={() => setConfirmDelete(true)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
              <EntryMetaChips
                workspaceId={fields.workspaceId}
                projectId={fields.projectId}
                activityId={fields.activityId}
                clientIds={fields.clientIds}
                requestIds={fields.requestIds}
                taskIds={fields.taskIds}
                description={fields.description}
                billable={fields.billable}
                projects={projects}
                activities={activities}
                clients={clients}
                projectClients={projectClients}
                stacked
                onChange={(next) => void commit({ ...fields, ...next })}
              />
              {draft?.mode !== 'start' && fields.start && fields.end ? (
                <div className="flex flex-nowrap items-center gap-1.5">
                  <DatePicker
                    size="sm"
                    aria-label="Date"
                    value={dateValue}
                    onChange={(value) => {
                      const [year, month, day] = value.split('-').map(Number)
                      const nextDay = new Date(year, (month || 1) - 1, day || 1)
                      if (Number.isNaN(nextDay.getTime())) return
                      const { start, end } = spanFrom(nextDay, startValue, endValue)
                      void commit({ ...fields, start, end })
                    }}
                  />
                  <div className="inline-flex h-8 shrink-0 items-center justify-around rounded-md border border-border bg-muted/60 px-2 font-mono text-xs">
                    <TimeField
                      aria-label="Start time"
                      value={startValue}
                      onChange={(value) => {
                        if (!fields.start) return
                        const { start, end } = spanFrom(fields.start, value, endValue)
                        void commit({ ...fields, start, end })
                      }}
                    />
                    <span className="pointer-events-none shrink-0 px-2 text-muted-foreground" aria-hidden="true">
                      →
                    </span>
                    <TimeField
                      aria-label="End time"
                      value={endValue}
                      onChange={(value) => {
                        if (!fields.start) return
                        const { start, end } = spanFrom(fields.start, startValue, value)
                        void commit({ ...fields, start, end })
                      }}
                    />
                  </div>
                  {duration ? (
                    <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{duration}</span>
                  ) : null}
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <Switch
                  id="entry-billable"
                  checked={fields.billable}
                  onCheckedChange={(billable) => void commit({ ...fields, billable })}
                />
                <Label htmlFor="entry-billable">Billable</Label>
                {draft?.mode === 'edit' ? (
                  <Button
                    className="ml-auto"
                    disabled={pending || !onContinue}
                    onClick={() => {
                      if (!onContinue) return
                      const nextMode = clientMode(projectClients.filter((row) => row.project_id === fields.projectId))
                      const workspaceId =
                        projects.find((project) => project.id === fields.projectId)?.workspace_id || fields.workspaceId
                      onContinue({
                        workspaceId,
                        projectId: fields.projectId || null,
                        description: fields.description,
                        billable: fields.billable,
                        activityId: fields.activityId || null,
                        clientIds: nextMode === 'manual' ? fields.clientIds : [],
                        requestIds: fields.requestIds,
                        taskIds: fields.taskIds,
                      })
                    }}
                  >
                    Continue?
                  </Button>
                ) : (
                  <Button
                    className="ml-auto"
                    disabled={pending || !fields.projectId}
                    onClick={() => {
                      const input = payload(fields)
                      if (!input) return
                      onSave(input)
                    }}
                  >
                    {draft?.mode === 'start' ? 'Start' : 'Log time'}
                  </Button>
                )}
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-bold text-destructive">Delete entry?</DialogTitle>
            <DialogDescription>This time entry is removed. This action is irreversible.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending || !draft?.entry}
              onClick={() => {
                if (!draft?.entry || !onDelete) return
                onDelete(draft.entry.id)
                setConfirmDelete(false)
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export type { Draft, Point }
export { Chip, EntryEditor, EntryMetaChips, clientMode }
