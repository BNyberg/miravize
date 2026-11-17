import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { endOfMonth, format, startOfMonth } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'

import { TaskComposer } from '@/components/tasks/task-composer'
import { TaskLedgerRow, type TaskPatch } from '@/components/tasks/task-row'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/auth-context'
import { useCatalog } from '@/features/projects/use-catalog'
import { useRunningTimer } from '@/features/timer/use-running-timer'
import { ALL_WORKSPACES, useWorkspace } from '@/features/workspaces/workspace-context'
import { assignmentClientMode, displayClientIds } from '@/lib/request-assignment'
import { taskCode } from '@/lib/task-code'
import type { Task, TaskStatus } from '@/types'
import { qk } from '@/lib/query-keys'
import { startTimer, stopTimer } from '@/lib/timer'
import { supabase } from '@/lib/supabase'
import { readTasksIncludeDoneStored, readUserPreferences } from '@/lib/user-preferences'
import { toast } from '@/components/ui/toast'



const STATUSES: TaskStatus[] = ['todo', 'doing', 'done']
const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'Todo', doing: 'Doing', done: 'Done' }
function statusLabel(value: TaskStatus) {
  return STATUS_LABEL[value]
}

function defaultStatuses(includeDone: boolean): TaskStatus[] {
  return includeDone ? [...STATUSES] : STATUSES.filter((status) => status !== 'done')
}

function statusFilterLabel(selected: TaskStatus[]) {
  if (selected.length === STATUSES.length) return 'All statuses'
  if (selected.length === 0) return 'None'
  return STATUSES.filter((status) => selected.includes(status)).map(statusLabel).join(', ')
}

const ALL = 'all'
const NO_CLIENT = '__none__'
const NO_PROJECT = '__none_project__'
const NO_ACTIVITY = '__none_activity__'

const TASK_SELECT = '*, project:projects(*), activity:activities(*), task_clients(client_id)'

async function failureMessage(err: unknown) {
  const context =
    err && typeof err === 'object' && 'context' in err ? (err as { context?: { json?: () => Promise<unknown> } }).context : undefined
  if (context && typeof context.json === 'function') {
    const body = (await context.json().catch(() => null)) as { error?: unknown } | null
    if (body && typeof body.error === 'string' && body.error) return body.error
  }
  if (err instanceof Error && err.message) return err.message
  return 'Try again.'
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function Filter({
  label,
  htmlFor,
  children,
  className = 'min-w-[10rem] flex-1',
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`grid gap-1.5 ${className}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

export function TasksPage() {
  const { user } = useAuth()
  const { workspaceId, isAll, workspaces } = useWorkspace()
  const catalog = useCatalog()
  const qc = useQueryClient()
  const { data: running } = useRunningTimer()
  const activeTaskIds = useMemo(
    () => new Set(running?.time_entry_tasks?.map((link) => link.task_id) ?? []),
    [running],
  )
  const [from, setFrom] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [to, setTo] = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [taskId, setTaskId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [clientId, setClientId] = useState('')
  const [activityId, setActivityId] = useState('')
  const [statuses, setStatuses] = useState<TaskStatus[]>(() => defaultStatuses(readTasksIncludeDoneStored() ?? false))
  const seededIncludeDone = useRef(readTasksIncludeDoneStored() != null)

  useEffect(() => {
    if (seededIncludeDone.current || !user) return
    seededIncludeDone.current = true
    if (readTasksIncludeDoneStored() != null) return
    setStatuses(defaultStatuses(readUserPreferences(user).tasks_include_done))
  }, [user])
  const [requester, setRequester] = useState('')
  const [task, setTask] = useState('')
  const list = useQuery({
    queryKey: qk.tasks(`${workspaceId}-${from}-${to}`),
    queryFn: async () => {
      let q = supabase
        .from('tasks')
        .select(TASK_SELECT)
        .gte('logged_on', from)
        .lte('logged_on', to)
        .order('logged_on', { ascending: false })
        .order('created_at', { ascending: false })
      if (!isAll) q = q.eq('workspace_id', workspaceId)
      const { data, error: err } = await q
      if (err) throw err
      return (data ?? []) as Task[]
    },
  })

  const rows = useMemo(() => {
    const query = taskId.trim().toLowerCase().replace(/^#/, '')
    return (list.data ?? [])
      .filter((row) => {
        if (query && !taskCode(row.task_number).toLowerCase().includes(query)) return false
        if (projectId && (row.project_id ?? NO_PROJECT) !== projectId) return false
        if (activityId && (row.activity_id ?? NO_ACTIVITY) !== activityId) return false
        if (!statuses.includes(row.status)) return false
        const clients = displayClientIds(row, catalog)
        if (!clientId) return true
        if (clientId === NO_CLIENT) return clients.length === 0
        return clients.includes(clientId)
      })
      .sort((a, b) => {
        if (a.logged_on !== b.logged_on) return a.logged_on < b.logged_on ? 1 : -1
        if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1
        return b.task_number - a.task_number || (a.id < b.id ? 1 : -1)
      })
  }, [activityId, catalog, clientId, list.data, projectId, statuses, taskId])

  const save = useMutation({
    mutationFn: async (input: {
      workspaceId: string
      assignment: { projectId: string; activityId: string; clientIds: string[] }
      notes: string
      files: File[]
      requester: string
      task: string
      loggedOn: string
      track?: boolean
    }) => {
      if (!input.workspaceId || input.workspaceId === ALL_WORKSPACES) throw new Error('Pick a workspace.')
      let nextRequester = input.requester.trim()
      let nextTask = input.task.trim()
      const submissionId = crypto.randomUUID()
      if (input.files.length > 0 && (!nextRequester || !nextTask)) {
        const images = await Promise.all(
          input.files.map(async (file) => ({
            media_type: file.type || 'image/png',
            data: await fileToBase64(file),
          })),
        )
        const { data, error: fnErr } = await supabase.functions.invoke('extract-task', {
          body: { workspace_id: input.workspaceId, images },
        })
        if (fnErr) throw new Error(await failureMessage(fnErr))
        if (data?.error) throw new Error(data.error as string)
        nextRequester = nextRequester || String(data?.requester ?? '').trim()
        nextTask = nextTask || String(data?.task ?? '').trim()
        setRequester(nextRequester)
        setTask(nextTask)
        if (!nextRequester || !nextTask) {
          throw new Error('Add the requester and task, then log again.')
        }
      }
      if (!nextRequester || !nextTask) throw new Error('Add the requester and task.')
      const { data, error: err } = await supabase.rpc('log_task', {
        p_workspace_id: input.workspaceId,
        p_submission_id: submissionId,
        p_requester: nextRequester,
        p_task: nextTask,
        p_project_id: input.assignment.projectId || null,
        p_activity_id: input.assignment.activityId || null,
        p_client_ids: input.assignment.clientIds,
        p_additional_notes: input.notes || null,
        p_screenshot_paths: [],
        p_logged_on: input.loggedOn,
      })
      if (err) throw err
      const created = (Array.isArray(data) ? data[0] : data) as { id?: string } | null
      if (input.track) {
        if (!created?.id) throw new Error('Task saved, but tracking could not start.')
        const projectId = input.assignment.projectId
        const mode = assignmentClientMode(catalog, projectId)
        const project = catalog.allProjects.find((item) => item.id === projectId)
        try {
          await startTimer({
            workspaceId: input.workspaceId,
            projectId: projectId || null,
            activityId: input.assignment.activityId || null,
            clientIds: mode === 'manual' ? input.assignment.clientIds : [],
            description: nextTask,
            billable: project?.billable ?? true,
            source: 'quick_start',
            taskIds: [created.id],
          })
          const { error: statusErr } = await supabase.rpc('update_task', {
            p_id: created.id,
            p_requester: nextRequester,
            p_task: nextTask,
            p_status: 'doing',
            p_project_id: input.assignment.projectId || null,
            p_activity_id: input.assignment.activityId || null,
            p_client_ids: input.assignment.clientIds,
            p_additional_notes: input.notes || null,
          })
          if (statusErr) throw statusErr
        } catch (trackErr) {
          void qc.invalidateQueries({ queryKey: ['tasks'] })
          const message = trackErr instanceof Error ? trackErr.message : 'Tracking did not start.'
          throw new Error(`Task saved. ${message}`)
        }
      }
      return true
    },
    onSuccess: () => {
      setRequester('')
      setTask('')
      void qc.invalidateQueries({ queryKey: ['tasks'] })
      void qc.invalidateQueries({ queryKey: ['task-requesters'] })
      void qc.invalidateQueries({ queryKey: qk.running })
      void qc.invalidateQueries({ queryKey: ['entries'] })
    },
    onError: (err: Error) => toast({ tone: 'error', title: 'Could not log task', description: err.message }),
  })

  const patch = useMutation({
    mutationFn: async (input: TaskPatch) => {
      const { error: err } = await supabase.rpc('update_task', {
        p_id: input.id,
        p_requester: input.requester,
        p_task: input.task,
        p_status: input.status,
        p_project_id: input.projectId || null,
        p_activity_id: input.activityId || null,
        p_client_ids: input.clientIds,
        p_additional_notes: input.notes,
      })
      if (err) throw err
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (err: Error) => toast({ tone: 'error', title: 'Could not update task', description: err.message }),
  })

  const track = useMutation({
    mutationFn: async (row: Task) => {
      if (!row.project_id) throw new Error('Choose a project first.')
      const projectId = row.project_id
      const mode = assignmentClientMode(catalog, projectId)
      const project = row.project ?? catalog.allProjects.find((item) => item.id === projectId)
      await startTimer({
        workspaceId: row.workspace_id,
        projectId: row.project_id,
        activityId: row.activity_id,
        clientIds: mode === 'manual' ? displayClientIds(row, catalog) : [],
        description: row.task,
        billable: project?.billable ?? true,
        source: 'quick_start',
        taskIds: [row.id],
      })
      const { error: statusErr } = await supabase.rpc('update_task', {
        p_id: row.id,
        p_requester: row.requester,
        p_task: row.task,
        p_status: 'doing',
        p_project_id: row.project_id,
        p_activity_id: row.activity_id,
        p_client_ids: row.task_clients?.map((link) => link.client_id) ?? [],
        p_additional_notes: row.additional_notes,
      })
      if (statusErr) throw statusErr
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.running })
      void qc.invalidateQueries({ queryKey: ['entries'] })
      void qc.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (err: Error) => toast({ tone: 'error', title: 'Could not start tracking', description: err.message }),
  })

  const stop = useMutation({
    mutationFn: stopTimer,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.running })
      void qc.invalidateQueries({ queryKey: ['entries'] })
    },
    onError: (err: Error) => toast({ tone: 'error', title: 'Could not stop tracking', description: err.message }),
  })

  const remove = useMutation({
    mutationFn: async (row: Task) => {
      const { error: err } = await supabase.rpc('delete_task', { p_id: row.id })
      if (err) throw err
      const paths = [
        ...(row.screenshot_paths ?? []),
        ...(row.screenshot_path ? [row.screenshot_path] : []),
      ]
      if (paths.length > 0) {
        await supabase.storage.from('request-screenshots').remove(paths)
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (err: Error) => toast({ tone: 'error', title: 'Could not delete task', description: err.message }),
  })

  function exportCsv() {
    const header = isAll
      ? ['ID', 'Workspace', 'Date', 'Requester', 'Task', 'Status', 'Project', 'Activity', 'Client', 'Notes']
      : ['ID', 'Date', 'Requester', 'Task', 'Status', 'Project', 'Activity', 'Client', 'Notes']
    const cell = (value: string) => `"${value.replaceAll('"', '""')}"`
    const lines = [
      header.join(','),
      ...rows.map((row) => {
        const clients = displayClientIds(row, catalog)
          .map((id) => catalog.clients.find((client) => client.id === id)?.name)
          .filter(Boolean)
          .join(', ')
        const values = [
          taskCode(row.task_number),
          ...(isAll ? [workspaces.find((ws) => ws.id === row.workspace_id)?.name ?? ''] : []),
          row.logged_on,
          row.requester,
          row.task,
          statusLabel(row.status),
          row.project?.name ?? '',
          row.activity?.name ?? '',
          clients,
          row.additional_notes ?? '',
        ]
        return values.map(cell).join(',')
      }),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tasks-${from}-to-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
      <h1 className="sr-only">Tasks</h1>
      <div className="shrink-0">
        <TaskComposer
          catalog={catalog}
          workspaceId={workspaceId}
          isAll={isAll}
          pending={save.isPending}
          requester={requester}
          task={task}
          onRequester={setRequester}
          onTask={setTask}
          onSubmit={(input) => save.mutateAsync(input)}
        />
      </div>
      <div className="flex shrink-0 flex-wrap items-end gap-3">
        <Filter label="ID" htmlFor="task-id" className="w-28">
          <Input
            id="task-id"
            value={taskId}
            onChange={(event) => setTaskId(event.target.value)}
            placeholder="All"
            inputMode="numeric"
          />
        </Filter>
        <Filter label="Range">
          <DateRangePicker
            id="task-range"
            from={from}
            to={to}
            onChange={(range) => {
              setFrom(range.from)
              setTo(range.to)
            }}
          />
        </Filter>
        <Filter label="Project">
          <Select value={projectId || ALL} onValueChange={(value) => setProjectId(value === ALL ? '' : value)}>
            <SelectTrigger aria-label="Project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All projects</SelectItem>
              {projectId === NO_PROJECT ? <SelectItem value={NO_PROJECT}>No project</SelectItem> : null}
              {catalog.projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  <span className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-sm" style={{ background: project.color }} aria-hidden="true" />
                    {project.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Filter>
        <Filter label="Client">
          <Select value={clientId || ALL} onValueChange={(value) => setClientId(value === ALL ? '' : value)}>
            <SelectTrigger aria-label="Client">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All clients</SelectItem>
              {clientId === NO_CLIENT ? <SelectItem value={NO_CLIENT}>No client</SelectItem> : null}
              {catalog.clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Filter>
        <Filter label="Activity">
          <Select value={activityId || ALL} onValueChange={(value) => setActivityId(value === ALL ? '' : value)}>
            <SelectTrigger aria-label="Activity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All activities</SelectItem>
              {activityId === NO_ACTIVITY ? <SelectItem value={NO_ACTIVITY}>No activity</SelectItem> : null}
              {catalog.activities.map((activity) => (
                <SelectItem key={activity.id} value={activity.id}>
                  {activity.name}
                  {activity.client_id
                    ? ` · ${catalog.clients.find((client) => client.id === activity.client_id)?.name ?? ''}`
                    : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Filter>
        <Filter label="Status">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Status"
                className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background py-1 pl-3 pr-2.5 text-left text-sm transition-colors duration-75 hover:bg-muted data-[state=open]:bg-muted"
              >
                <span className="min-w-0 flex-1 truncate">{statusFilterLabel(statuses)}</span>
                <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1">
              {STATUSES.map((value) => {
                const checked = statuses.includes(value)
                return (
                  <label key={value} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) =>
                        setStatuses((current) =>
                          next === true ? [...current, value] : current.filter((status) => status !== value),
                        )
                      }
                    />
                    {statusLabel(value)}
                  </label>
                )
              })}
            </PopoverContent>
          </Popover>
        </Filter>
        <div className="ml-auto">
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            Export CSV
          </Button>
        </div>
      </div>
      <div className="min-h-[calc(2.25rem+5*3rem)] min-w-0 flex-1 overflow-auto rounded-lg border border-border bg-card">
        <Table className="w-max min-w-full">
          <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card [&_th]:pr-0">
            <TableRow>
              <TableHead className="whitespace-nowrap">ID</TableHead>
              {isAll ? <TableHead className="min-w-[10rem]">Workspace</TableHead> : null}
              <TableHead className="whitespace-nowrap">Date</TableHead>
              <TableHead className="w-32 min-w-32">Requester</TableHead>
              <TableHead className="min-w-[28rem]">Task</TableHead>
              <TableHead className="min-w-[8rem]">Status</TableHead>
              <TableHead className="min-w-[12rem]">Project</TableHead>
              <TableHead className="min-w-[12rem]">Activity</TableHead>
              <TableHead className="min-w-[12rem]">Client</TableHead>
              <TableHead className="min-w-[16rem]">Notes</TableHead>
              <TableHead className="sticky right-0 z-20 w-20 border-l border-border bg-card"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TaskLedgerRow
                key={row.id}
                row={row}
                catalog={catalog}
                showWorkspace={isAll}
                workspaceName={workspaces.find((ws) => ws.id === row.workspace_id)?.name}
                onPatch={(next) => patch.mutate(next)}
                tracking={track.isPending && track.variables?.id === row.id}
                active={activeTaskIds.has(row.id)}
                stopping={stop.isPending && activeTaskIds.has(row.id)}
                onTrack={() => track.mutate(row)}
                onStop={() => stop.mutate()}
                deleting={remove.isPending && remove.variables?.id === row.id}
                onDelete={() => remove.mutate(row)}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
