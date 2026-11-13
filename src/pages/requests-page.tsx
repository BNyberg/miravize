import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { endOfMonth, format, startOfMonth } from 'date-fns'
import { useMemo, useState } from 'react'

import { RequestComposer } from '@/components/requests/request-composer'
import { RequestLedgerRow, type RequestPatch } from '@/components/requests/request-row'
import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useCatalog } from '@/features/projects/use-catalog'
import { ALL_WORKSPACES, useWorkspace } from '@/features/workspaces/workspace-context'
import { assignmentClientMode, displayClientIds } from '@/lib/request-assignment'
import { requestCode } from '@/lib/request-code'
import { qk } from '@/lib/query-keys'
import { startTimer } from '@/lib/timer'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/ui/toast'
import type { SupportRequest } from '@/types'

const ALL = 'all'
const NO_CLIENT = '__none__'
const NO_PROJECT = '__none_project__'
const NO_ACTIVITY = '__none_activity__'

const REQUEST_SELECT = '*, project:projects(*), activity:activities(*), request_clients(client_id)'

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

export function RequestsPage() {
  const { workspaceId, isAll, workspaces } = useWorkspace()
  const catalog = useCatalog()
  const qc = useQueryClient()
  const [from, setFrom] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [to, setTo] = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [taskId, setTaskId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [clientId, setClientId] = useState('')
  const [activityId, setActivityId] = useState('')
  const [requester, setRequester] = useState('')
  const [request, setRequest] = useState('')
  const list = useQuery({
    queryKey: qk.requests(`${workspaceId}-${from}-${to}`),
    queryFn: async () => {
      let q = supabase
        .from('requests')
        .select(REQUEST_SELECT)
        .gte('logged_on', from)
        .lte('logged_on', to)
        .order('logged_on', { ascending: false })
        .order('created_at', { ascending: false })
      if (!isAll) q = q.eq('workspace_id', workspaceId)
      const { data, error: err } = await q
      if (err) throw err
      return (data ?? []) as SupportRequest[]
    },
  })

  const rows = useMemo(() => {
    const query = taskId.trim().toLowerCase().replace(/^#/, '')
    return (list.data ?? [])
      .filter((row) => {
        if (query && !requestCode(row.task_number).toLowerCase().includes(query)) return false
        if (projectId && (row.project_id ?? NO_PROJECT) !== projectId) return false
        if (activityId && (row.activity_id ?? NO_ACTIVITY) !== activityId) return false
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
  }, [activityId, catalog, clientId, list.data, projectId, taskId])

  const save = useMutation({
    mutationFn: async (input: {
      workspaceId: string
      assignment: { projectId: string; activityId: string; clientIds: string[] }
      notes: string
      files: File[]
      requester: string
      request: string
      loggedOn: string
      track?: boolean
    }) => {
      if (!input.workspaceId || input.workspaceId === ALL_WORKSPACES) throw new Error('Pick a workspace.')
      let nextRequester = input.requester.trim()
      let nextRequest = input.request.trim()
      const submissionId = crypto.randomUUID()
      if (input.files.length > 0 && (!nextRequester || !nextRequest)) {
        const images = await Promise.all(
          input.files.map(async (file) => ({
            media_type: file.type || 'image/png',
            data: await fileToBase64(file),
          })),
        )
        const { data, error: fnErr } = await supabase.functions.invoke('extract-request', {
          body: { workspace_id: input.workspaceId, images },
        })
        if (fnErr) throw new Error(await failureMessage(fnErr))
        if (data?.error) throw new Error(data.error as string)
        nextRequester = nextRequester || String(data?.requester ?? '').trim()
        nextRequest = nextRequest || String(data?.request ?? '').trim()
        setRequester(nextRequester)
        setRequest(nextRequest)
        if (!nextRequester || !nextRequest) {
          throw new Error('Add the requester and request, then log again.')
        }
      }
      if (!nextRequester || !nextRequest) throw new Error('Add the requester and request.')
      const { data, error: err } = await supabase.rpc('log_support_request', {
        p_workspace_id: input.workspaceId,
        p_submission_id: submissionId,
        p_requester: nextRequester,
        p_request: nextRequest,
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
        if (!created?.id) throw new Error('Request saved, but tracking could not start.')
        const projectId = input.assignment.projectId
        const mode = assignmentClientMode(catalog, projectId)
        const project = catalog.allProjects.find((item) => item.id === projectId)
        try {
          await startTimer({
            workspaceId: input.workspaceId,
            projectId: projectId || null,
            activityId: input.assignment.activityId || null,
            clientIds: mode === 'manual' ? input.assignment.clientIds : [],
            description: nextRequest,
            billable: project?.billable ?? true,
            source: 'quick_start',
            requestIds: [created.id],
          })
        } catch (trackErr) {
          void qc.invalidateQueries({ queryKey: ['requests'] })
          const message = trackErr instanceof Error ? trackErr.message : 'Tracking did not start.'
          throw new Error(`Request saved. ${message}`)
        }
      }
      return true
    },
    onSuccess: () => {
      setRequester('')
      setRequest('')
      void qc.invalidateQueries({ queryKey: ['requests'] })
      void qc.invalidateQueries({ queryKey: ['request-requesters'] })
      void qc.invalidateQueries({ queryKey: qk.running })
      void qc.invalidateQueries({ queryKey: ['entries'] })
    },
    onError: (err: Error) => toast({ tone: 'error', title: 'Could not log request', description: err.message }),
  })

  const patch = useMutation({
    mutationFn: async (input: RequestPatch) => {
      const { error: err } = await supabase.rpc('update_support_request', {
        p_id: input.id,
        p_requester: input.requester,
        p_request: input.request,
        p_project_id: input.projectId || null,
        p_activity_id: input.activityId || null,
        p_client_ids: input.clientIds,
        p_additional_notes: input.notes,
      })
      if (err) throw err
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['requests'] })
    },
    onError: (err: Error) => toast({ tone: 'error', title: 'Could not update request', description: err.message }),
  })

  const track = useMutation({
    mutationFn: async (row: SupportRequest) => {
      if (!row.project_id) throw new Error('Choose a project first.')
      const projectId = row.project_id
      const mode = assignmentClientMode(catalog, projectId)
      const project = row.project ?? catalog.allProjects.find((item) => item.id === projectId)
      await startTimer({
        workspaceId: row.workspace_id,
        projectId: row.project_id,
        activityId: row.activity_id,
        clientIds: mode === 'manual' ? displayClientIds(row, catalog) : [],
        description: row.request,
        billable: project?.billable ?? true,
        source: 'quick_start',
        requestIds: [row.id],
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.running })
      void qc.invalidateQueries({ queryKey: ['entries'] })
    },
    onError: (err: Error) => toast({ tone: 'error', title: 'Could not start tracking', description: err.message }),
  })

  const remove = useMutation({
    mutationFn: async (row: SupportRequest) => {
      const { error: err } = await supabase.rpc('delete_support_request', { p_id: row.id })
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
      void qc.invalidateQueries({ queryKey: ['requests'] })
    },
    onError: (err: Error) => toast({ tone: 'error', title: 'Could not delete request', description: err.message }),
  })

  function exportCsv() {
    const header = isAll
      ? ['Task ID', 'Workspace', 'Date', 'Requester', 'Request', 'Project', 'Activity', 'Client', 'Notes']
      : ['Task ID', 'Date', 'Requester', 'Request', 'Project', 'Activity', 'Client', 'Notes']
    const cell = (value: string) => `"${value.replaceAll('"', '""')}"`
    const lines = [
      header.join(','),
      ...rows.map((row) => {
        const clients = displayClientIds(row, catalog)
          .map((id) => catalog.clients.find((client) => client.id === id)?.name)
          .filter(Boolean)
          .join(', ')
        const values = [
          requestCode(row.task_number),
          ...(isAll ? [workspaces.find((ws) => ws.id === row.workspace_id)?.name ?? ''] : []),
          row.logged_on,
          row.requester,
          row.request,
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
    a.download = `requests-${from}-to-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
      <h1 className="sr-only">Requests</h1>
      <RequestComposer
        catalog={catalog}
        workspaceId={workspaceId}
        isAll={isAll}
        pending={save.isPending}
        requester={requester}
        request={request}
        onRequester={setRequester}
        onRequest={setRequest}
        onSubmit={(input) => save.mutateAsync(input)}
      />
      <div className="flex flex-wrap items-end gap-3">
        <Filter label="ID" htmlFor="request-id" className="w-28">
          <Input
            id="request-id"
            value={taskId}
            onChange={(event) => setTaskId(event.target.value)}
            placeholder="All"
            inputMode="numeric"
          />
        </Filter>
        <Filter label="Range">
          <DateRangePicker
            id="request-range"
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
        <div className="ml-auto">
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            Export CSV
          </Button>
        </div>
      </div>
      <div className="min-w-0 max-h-[calc(2.25rem+13*3rem)] overflow-auto rounded-lg border border-border bg-card">
        <Table className="w-max min-w-full">
          <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card [&_th]:pr-0">
            <TableRow>
              <TableHead className="whitespace-nowrap">Task ID</TableHead>
              {isAll ? <TableHead className="min-w-[10rem]">Workspace</TableHead> : null}
              <TableHead className="whitespace-nowrap">Date</TableHead>
              <TableHead className="w-32 min-w-32">Requester</TableHead>
              <TableHead className="min-w-[28rem]">Request</TableHead>
              <TableHead className="min-w-[12rem]">Project</TableHead>
              <TableHead className="min-w-[12rem]">Activity</TableHead>
              <TableHead className="min-w-[12rem]">Client</TableHead>
              <TableHead className="min-w-[16rem]">Notes</TableHead>
              <TableHead className="sticky right-0 z-20 w-20 border-l border-border bg-card"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <RequestLedgerRow
                key={row.id}
                row={row}
                catalog={catalog}
                showWorkspace={isAll}
                workspaceName={workspaces.find((ws) => ws.id === row.workspace_id)?.name}
                onPatch={(next) => patch.mutate(next)}
                tracking={track.isPending && track.variables?.id === row.id}
                onTrack={() => track.mutate(row)}
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
