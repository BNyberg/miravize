import { InformationCircleIcon } from '@heroicons/react/24/outline'
import { useQuery } from '@tanstack/react-query'
import { endOfMonth, format, startOfMonth } from 'date-fns'
import { Fragment, useMemo, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useCatalog } from '@/features/projects/use-catalog'
import { useWorkspace } from '@/features/workspaces/workspace-context'
import { qk } from '@/lib/query-keys'
import { displayClientIds } from '@/lib/request-assignment'
import { requestCode } from '@/lib/request-code'
import { taskCode } from '@/lib/task-code'
import { allocateSeconds, formatHours } from '@/lib/splits'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { SupportRequest, Task, TimeEntry } from '@/types'

const ALL = 'all'
const NO_CLIENT = '__none__'
const NO_PROJECT = '__none_project__'
const NO_ACTIVITY = '__none_activity__'
const NO_REQUESTER = '__none_requester__'
const PALETTE = ['#1F7A4D', '#0F6B5C', '#1F5E7A', '#2F4A8A', '#5E3A8A', '#8A3A5E', '#B42318', '#9A4A12', '#7A6B1F', '#3D5A3A']

type Money = Record<string, number>

type Share = {
  entry: TimeEntry
  clientId: string
  projectId: string
  activityId: string
  seconds: number
  amount: number
  currency: string
}

type Bucket = { id: string; label: string; color: string; seconds: number }

type ProjectSplit = { id: string; name: string; seconds: number; money: Money }

type ClientSplit = { id: string; name: string; seconds: number; money: Money; projects: ProjectSplit[] }

type RequestTime = { id: string; label: string; project: string; seconds: number; money: Money }

function addMoney(map: Money, currency: string, amount: number) {
  if (!amount) return
  const key = currency || '—'
  map[key] = (map[key] ?? 0) + amount
}

function formatMoney(map: Money) {
  const parts = Object.entries(map)
  if (parts.length === 0) return '0'
  return parts.map(([currency, amount]) => `${amount.toFixed(2)} ${currency}`).join(' · ')
}

export function ReportPage() {
  const { workspaceId, isAll, workspaces } = useWorkspace()
  const catalog = useCatalog()
  const [from, setFrom] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [to, setTo] = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [projectId, setProjectId] = useState('')
  const [clientId, setClientId] = useState('')
  const [activityId, setActivityId] = useState('')

  const entries = useQuery({
    queryKey: qk.entries(workspaceId, `${from}-${to}`),
    queryFn: async () => {
      let q = supabase
        .from('time_entries')
        .select(
          '*, project:projects(*), activity:activities(*), time_entry_clients(client_id), time_entry_requests(request_id, request:requests(id, task_number, request, requester, project_id, activity_id, project:projects(name), request_clients(client_id))), time_entry_tasks(task_id, task:tasks(id, task_number, task, requester, project_id, activity_id, project:projects(name), task_clients(client_id)))',
        )
        .gte('started_at', `${from}T00:00:00`)
        .lte('started_at', `${to}T23:59:59`)
        .not('stopped_at', 'is', null)
      if (!isAll) q = q.eq('workspace_id', workspaceId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as TimeEntry[]
    },
  })

  const requests = useQuery({
    queryKey: qk.requests(`${workspaceId}-${from}-${to}`),
    queryFn: async () => {
      let q = supabase
        .from('requests')
        .select('*, project:projects(*), activity:activities(*), request_clients(client_id)')
        .gte('logged_on', from)
        .lte('logged_on', to)
      if (!isAll) q = q.eq('workspace_id', workspaceId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as SupportRequest[]
    },
  })

  const tasks = useQuery({
    queryKey: qk.tasks(`${workspaceId}-${from}-${to}`),
    queryFn: async () => {
      let q = supabase
        .from('tasks')
        .select('*, project:projects(*), activity:activities(*), task_clients(client_id)')
        .gte('logged_on', from)
        .lte('logged_on', to)
      if (!isAll) q = q.eq('workspace_id', workspaceId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Task[]
    },
  })

  const report = useMemo(() => {
    const included: TimeEntry[] = []
    const shares: Share[] = []

    for (const entry of entries.data ?? []) {
      if (projectId && (entry.project_id ?? NO_PROJECT) !== projectId) continue
      if (activityId && (entry.activity_id ?? NO_ACTIVITY) !== activityId) continue
      const links = catalog.projectClients.filter((pc) => pc.project_id === entry.project_id)
      const seconds = entry.duration_seconds ?? 0
      const project = entry.project
      const currency = project?.currency ?? ''
      const next: Share[] = []

      function push(id: string, shareSeconds: number) {
        const link = links.find((row) => row.client_id === id)
        const rate = link?.hourly_rate ?? project?.hourly_rate ?? null
        const amount = entry.billable && rate != null ? (shareSeconds / 3600) * Number(rate) : 0
        next.push({
          entry,
          clientId: id,
          projectId: entry.project_id ?? NO_PROJECT,
          activityId: entry.activity_id ?? NO_ACTIVITY,
          seconds: shareSeconds,
          amount,
          currency,
        })
      }

      if (links.length === 0) {
        push(NO_CLIENT, seconds)
      } else if (links.every((pc) => pc.split_percent == null)) {
        const assigned = entry.time_entry_clients ?? []
        if (assigned.length === 0) push(NO_CLIENT, seconds)
        else for (const link of assigned) push(link.client_id, seconds)
      } else {
        const allocated = allocateSeconds(
          seconds,
          links.map((pc) => ({
            clientId: pc.client_id,
            percent: pc.split_percent == null ? null : Number(pc.split_percent),
          })),
        )
        for (const share of allocated) push(share.clientId, share.seconds)
      }

      const visible = clientId ? next.filter((share) => share.clientId === clientId) : next
      if (visible.length === 0) continue
      included.push(entry)
      shares.push(...visible)
    }

    const totalSeconds = included.reduce((sum, entry) => sum + (entry.duration_seconds ?? 0), 0)
    const billableSeconds = included.reduce(
      (sum, entry) => sum + (entry.billable ? entry.duration_seconds ?? 0 : 0),
      0,
    )
    const money: Money = {}
    for (const share of shares) addMoney(money, share.currency, share.amount)

    function nameFor(id: string, kind: 'client' | 'project' | 'activity') {
      if (kind === 'client') {
        if (id === NO_CLIENT) return 'No client'
        return catalog.clients.find((client) => client.id === id)?.name ?? 'Unknown client'
      }
      if (kind === 'project') {
        if (id === NO_PROJECT) return 'No project'
        return (
          catalog.allProjects.find((project) => project.id === id)?.name ??
          included.find((entry) => entry.project_id === id)?.project?.name ??
          (requests.data ?? []).find((req) => req.project_id === id)?.project?.name ??
          (tasks.data ?? []).find((task) => task.project_id === id)?.project?.name ??
          'Unknown project'
        )
      }
      if (id === NO_ACTIVITY) return 'No activity'
      return (
        catalog.activities.find((activity) => activity.id === id)?.name ??
        included.find((entry) => entry.activity_id === id)?.activity?.name ??
        (requests.data ?? []).find((req) => req.activity_id === id)?.activity?.name ??
        (tasks.data ?? []).find((task) => task.activity_id === id)?.activity?.name ??
        'Unknown activity'
      )
    }

    function colorFor(id: string, index: number) {
      return catalog.allProjects.find((project) => project.id === id)?.color ?? PALETTE[index % PALETTE.length]!
    }

    function buckets(kind: 'project' | 'client' | 'activity'): Bucket[] {
      const map = new Map<string, number>()
      if (kind === 'client') {
        for (const share of shares) map.set(share.clientId, (map.get(share.clientId) ?? 0) + share.seconds)
      } else {
        for (const entry of included) {
          const id = kind === 'project' ? entry.project_id ?? NO_PROJECT : entry.activity_id ?? NO_ACTIVITY
          map.set(id, (map.get(id) ?? 0) + (entry.duration_seconds ?? 0))
        }
      }
      return [...map.entries()]
        .filter(([, seconds]) => seconds > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([id, seconds], index) => ({
          id,
          label: nameFor(id, kind),
          color: colorFor(kind === 'project' ? id : `${kind}-${id}`, index),
          seconds,
        }))
    }

    const clients = new Map<string, ClientSplit>()
    for (const share of shares) {
      const client = clients.get(share.clientId) ?? {
        id: share.clientId,
        name: nameFor(share.clientId, 'client'),
        seconds: 0,
        money: {},
        projects: [],
      }
      client.seconds += share.seconds
      addMoney(client.money, share.currency, share.amount)
      let project = client.projects.find((row) => row.id === share.projectId)
      if (!project) {
        project = { id: share.projectId, name: nameFor(share.projectId, 'project'), seconds: 0, money: {} }
        client.projects.push(project)
      }
      project.seconds += share.seconds
      addMoney(project.money, share.currency, share.amount)
      clients.set(share.clientId, client)
    }
    const clientSplits = [...clients.values()]
      .map((client) => ({
        ...client,
        projects: client.projects.sort((a, b) => b.seconds - a.seconds),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const filteredRequests = (requests.data ?? []).filter((req) => {
      if (projectId && (req.project_id ?? NO_PROJECT) !== projectId) return false
      if (activityId && (req.activity_id ?? NO_ACTIVITY) !== activityId) return false
      const linked = displayClientIds(req, catalog)
      if (!clientId) return true
      if (clientId === NO_CLIENT) return linked.length === 0
      return linked.includes(clientId)
    })

    function requestClientIds(req: SupportRequest) {
      const ids = displayClientIds(req, catalog)
      if (clientId === NO_CLIENT) return ids.length === 0 ? [NO_CLIENT] : []
      if (clientId) return ids.filter((id) => id === clientId)
      return ids.length === 0 ? [NO_CLIENT] : ids
    }

    function requesterId(name: string | null | undefined) {
      const trimmed = name?.trim()
      return trimmed ? trimmed : NO_REQUESTER
    }

    function requesterLabel(id: string) {
      return id === NO_REQUESTER ? 'No requester' : id
    }

    function ranked(map: Map<string, number>, label: (id: string) => string, colorId: (id: string) => string): Bucket[] {
      return [...map.entries()]
        .filter(([, seconds]) => seconds > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([id, seconds], index) => ({
          id,
          label: label(id),
          color: colorFor(colorId(id), index),
          seconds,
        }))
    }

    function requestBuckets(kind: 'project' | 'client' | 'activity' | 'requester'): Bucket[] {
      const map = new Map<string, number>()
      for (const req of filteredRequests) {
        const ids =
          kind === 'client'
            ? requestClientIds(req)
            : kind === 'project'
              ? [req.project_id ?? NO_PROJECT]
              : kind === 'activity'
                ? [req.activity_id ?? NO_ACTIVITY]
                : [requesterId(req.requester)]
        for (const id of ids) map.set(id, (map.get(id) ?? 0) + 1)
      }
      return ranked(
        map,
        (id) => (kind === 'requester' ? requesterLabel(id) : nameFor(id, kind)),
        (id) => (kind === 'project' ? id : `request-${kind}-${id}`),
      )
    }

    function requestHours(rows: TimeEntry[], visibleShares: Share[]) {
      const totals = new Map<string, RequestTime>()
      const byProject = new Map<string, number>()
      const byClient = new Map<string, number>()
      const byRequester = new Map<string, number>()
      const byActivity = new Map<string, number>()
      const known = new Map((requests.data ?? []).map((req) => [req.id, req]))
      for (const entry of rows) {
        const links = entry.time_entry_requests ?? []
        if (links.length === 0) continue
        const shareCount = links.length
        const seconds = (entry.duration_seconds ?? 0) / shareCount
        const entryShares = visibleShares.filter((share) => share.entry.id === entry.id)
        for (const link of links) {
          const req = link.request
          const full = known.get(link.request_id)
          const id = link.request_id
          const current = totals.get(id) ?? {
            id,
            label: req ? `${requestCode(req.task_number)} · ${req.request}` : 'Request',
            project: req?.project?.name ?? (req?.project_id ? nameFor(req.project_id, 'project') : 'No project'),
            seconds: 0,
            money: {},
          }
          current.seconds += seconds
          for (const share of entryShares) addMoney(current.money, share.currency, share.amount / shareCount)
          totals.set(id, current)

          const projectIdForRequest = full?.project_id ?? req?.project_id ?? NO_PROJECT
          const activityIdForRequest = full?.activity_id ?? req?.activity_id ?? NO_ACTIVITY
          byProject.set(projectIdForRequest, (byProject.get(projectIdForRequest) ?? 0) + seconds)
          byActivity.set(activityIdForRequest, (byActivity.get(activityIdForRequest) ?? 0) + seconds)
          const who = requesterId(full?.requester ?? req?.requester)
          byRequester.set(who, (byRequester.get(who) ?? 0) + seconds)
          const clientIds = full
            ? requestClientIds(full)
            : requestClientIds({
                project_id: req?.project_id ?? null,
                activity_id: req?.activity_id ?? null,
                request_clients: req?.request_clients,
              } as SupportRequest)
          const each = clientIds.length > 0 ? seconds / clientIds.length : 0
          for (const client of clientIds) byClient.set(client, (byClient.get(client) ?? 0) + each)
        }
      }
      return {
        rows: [...totals.values()].sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label)),
        projects: ranked(byProject, (id) => nameFor(id, 'project'), (id) => id),
        clients: ranked(byClient, (id) => nameFor(id, 'client'), (id) => `request-time-client-${id}`),
        requesters: ranked(byRequester, requesterLabel, (id) => `request-time-requester-${id}`),
        activities: ranked(byActivity, (id) => nameFor(id, 'activity'), (id) => `request-time-activity-${id}`),
      }
    }

    const filteredTasks = (tasks.data ?? []).filter((task) => {
      if (projectId && (task.project_id ?? NO_PROJECT) !== projectId) return false
      if (activityId && (task.activity_id ?? NO_ACTIVITY) !== activityId) return false
      const linked = displayClientIds(task, catalog)
      if (!clientId) return true
      if (clientId === NO_CLIENT) return linked.length === 0
      return linked.includes(clientId)
    })

    function taskClientIds(task: Task) {
      const ids = displayClientIds(task, catalog)
      if (clientId === NO_CLIENT) return ids.length === 0 ? [NO_CLIENT] : []
      if (clientId) return ids.filter((id) => id === clientId)
      return ids.length === 0 ? [NO_CLIENT] : ids
    }

    function taskBuckets(kind: 'project' | 'client' | 'activity' | 'requester'): Bucket[] {
      const map = new Map<string, number>()
      for (const task of filteredTasks) {
        const ids =
          kind === 'client'
            ? taskClientIds(task)
            : kind === 'project'
              ? [task.project_id ?? NO_PROJECT]
              : kind === 'activity'
                ? [task.activity_id ?? NO_ACTIVITY]
                : [requesterId(task.requester)]
        for (const id of ids) map.set(id, (map.get(id) ?? 0) + 1)
      }
      return ranked(
        map,
        (id) => (kind === 'requester' ? requesterLabel(id) : nameFor(id, kind)),
        (id) => (kind === 'project' ? id : `task-${kind}-${id}`),
      )
    }

    function taskHours(rows: TimeEntry[], visibleShares: Share[]) {
      const totals = new Map<string, RequestTime>()
      const byProject = new Map<string, number>()
      const byClient = new Map<string, number>()
      const byRequester = new Map<string, number>()
      const byActivity = new Map<string, number>()
      const known = new Map((tasks.data ?? []).map((task) => [task.id, task]))
      for (const entry of rows) {
        const links = entry.time_entry_tasks ?? []
        if (links.length === 0) continue
        const shareCount = links.length
        const seconds = (entry.duration_seconds ?? 0) / shareCount
        const entryShares = visibleShares.filter((share) => share.entry.id === entry.id)
        for (const link of links) {
          const task = link.task
          const full = known.get(link.task_id)
          const id = link.task_id
          const current = totals.get(id) ?? {
            id,
            label: task ? `${taskCode(task.task_number)} · ${task.task}` : 'Task',
            project: task?.project?.name ?? (task?.project_id ? nameFor(task.project_id, 'project') : 'No project'),
            seconds: 0,
            money: {},
          }
          current.seconds += seconds
          for (const share of entryShares) addMoney(current.money, share.currency, share.amount / shareCount)
          totals.set(id, current)

          const projectIdForTask = full?.project_id ?? task?.project_id ?? NO_PROJECT
          const activityIdForTask = full?.activity_id ?? task?.activity_id ?? NO_ACTIVITY
          byProject.set(projectIdForTask, (byProject.get(projectIdForTask) ?? 0) + seconds)
          byActivity.set(activityIdForTask, (byActivity.get(activityIdForTask) ?? 0) + seconds)
          const who = requesterId(full?.requester ?? task?.requester)
          byRequester.set(who, (byRequester.get(who) ?? 0) + seconds)
          const clientIds = full
            ? taskClientIds(full)
            : taskClientIds({
                project_id: task?.project_id ?? null,
                activity_id: task?.activity_id ?? null,
                task_clients: task?.task_clients,
              } as Task)
          const each = clientIds.length > 0 ? seconds / clientIds.length : 0
          for (const client of clientIds) byClient.set(client, (byClient.get(client) ?? 0) + each)
        }
      }
      return {
        rows: [...totals.values()].sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label)),
        projects: ranked(byProject, (id) => nameFor(id, 'project'), (id) => id),
        clients: ranked(byClient, (id) => nameFor(id, 'client'), (id) => `task-time-client-${id}`),
        requesters: ranked(byRequester, requesterLabel, (id) => `task-time-requester-${id}`),
        activities: ranked(byActivity, (id) => nameFor(id, 'activity'), (id) => `task-time-activity-${id}`),
      }
    }

    return {
      totalSeconds,
      billableSeconds,
      money,
      requestCount: filteredRequests.length,
      taskCount: filteredTasks.length,
      projects: buckets('project'),
      clients: buckets('client'),
      activities: buckets('activity'),
      requestProjects: requestBuckets('project'),
      requestClients: requestBuckets('client'),
      requestRequesters: requestBuckets('requester'),
      requestActivities: requestBuckets('activity'),
      clientSplits,
      shares,
      requestTime: requestHours(included, shares),
      taskProjects: taskBuckets('project'),
      taskClients: taskBuckets('client'),
      taskRequesters: taskBuckets('requester'),
      taskActivities: taskBuckets('activity'),
      taskTime: taskHours(included, shares),
    }
  }, [
    activityId,
    catalog.activities,
    catalog.allProjects,
    catalog.clients,
    catalog.projectClients,
    clientId,
    entries.data,
    projectId,
    requests.data,
    tasks.data,
  ])

  const loading = entries.isPending || requests.isPending || tasks.isPending || catalog.loading

  function exportCsv() {
    const header = ['Type', 'Client', 'Project', 'Activity', 'Hours', 'Amount', 'Currency']
    const lines = [header.join(',')]
    const cell = (value: string) => `"${value.replaceAll('"', '""')}"`
    for (const client of report.clientSplits) {
      for (const [currency, amount] of Object.entries(client.money)) {
        lines.push(
          ['Client total', client.name, '', '', formatHours(client.seconds), amount.toFixed(2), currency].map(cell).join(','),
        )
      }
      if (Object.keys(client.money).length === 0) {
        lines.push(['Client total', client.name, '', '', formatHours(client.seconds), '0', ''].map(cell).join(','))
      }
    }
    for (const row of report.taskTime.rows) {
      const parts = Object.entries(row.money)
      if (parts.length === 0) {
        lines.push(['Task', row.label, row.project, '', formatHours(row.seconds), '0', ''].map(cell).join(','))
      } else {
        for (const [currency, amount] of parts) {
          lines.push(
            ['Task', row.label, row.project, '', formatHours(row.seconds), amount.toFixed(2), currency].map(cell).join(','),
          )
        }
      }
    }
    for (const row of report.requestTime.rows) {
      const parts = Object.entries(row.money)
      if (parts.length === 0) {
        lines.push(['Request', row.label, row.project, '', formatHours(row.seconds), '0', ''].map(cell).join(','))
      } else {
        for (const [currency, amount] of parts) {
          lines.push(
            ['Request', row.label, row.project, '', formatHours(row.seconds), amount.toFixed(2), currency].map(cell).join(','),
          )
        }
      }
    }
    for (const share of report.shares) {
      const client = report.clientSplits.find((row) => row.id === share.clientId)
      const project = client?.projects.find((row) => row.id === share.projectId)
      const activity =
        share.activityId === NO_ACTIVITY
          ? ''
          : catalog.activities.find((row) => row.id === share.activityId)?.name ?? share.entry.activity?.name ?? ''
      lines.push(
        [
          'Entry',
          client?.name ?? '',
          project?.name ?? '',
          activity,
          formatHours(share.seconds),
          share.amount.toFixed(2),
          share.currency,
        ]
          .map(cell)
          .join(','),
      )
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${from}-to-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <h1 className="sr-only">Report</h1>
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <Filter label="Range">
          <DateRangePicker
            id="range"
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
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={report.clientSplits.length === 0 && report.requestCount === 0 && report.requestTime.rows.length === 0 && report.taskCount === 0 && report.taskTime.rows.length === 0}
          >
            Export CSV
          </Button>
          <Button onClick={() => window.print()}>Print report</Button>
        </div>
      </div>

      <div className="flex flex-nowrap gap-3">
        {loading ? (
          <>
            <SummarySkeleton label="Total hours" />
            <SummarySkeleton label="Billable hours" />
            <SummarySkeleton label="Amount" />
            <SummarySkeleton label="Requests" />
            <SummarySkeleton label="Tasks" />
          </>
        ) : (
          <>
            <Summary label="Total hours" value={formatHours(report.totalSeconds)} />
            <Summary label="Billable hours" value={formatHours(report.billableSeconds)} />
            <Summary label="Amount" value={formatMoney(report.money)} />
            <Summary label="Requests" value={String(report.requestCount)} />
            <Summary label="Tasks" value={String(report.taskCount)} />
          </>
        )}
      </div>

      <div className="grid gap-4 print:hidden lg:grid-cols-3">
        {loading ? (
          <>
            <DonutSkeleton title="Hours by project" />
            <DonutSkeleton title="Hours by client" />
            <DonutSkeleton title="Hours by activity" />
          </>
        ) : (
          <>
            <Donut
              title="Hours by project"
              slices={report.projects}
              selectedId={projectId}
              onSelect={(id) => setProjectId(id === projectId ? '' : id)}
            />
            <Donut
              title="Hours by client"
              slices={report.clients}
              selectedId={clientId}
              onSelect={(id) => setClientId(id === clientId ? '' : id)}
            />
            <Donut
              title="Hours by activity"
              slices={report.activities}
              selectedId={activityId}
              onSelect={(id) => setActivityId(id === activityId ? '' : id)}
            />
          </>
        )}
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium">Clients and projects</h2>
        {loading ? (
          <ClientsSkeleton />
        ) : report.clientSplits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No time in this range.</p>
        ) : (
          <div className="max-h-[25rem] overflow-y-auto rounded-lg border border-border bg-card print:max-h-none print:overflow-visible">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client / project</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.clientSplits.map((client) => (
                <Fragment key={client.id}>
                  <TableRow>
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell className="tabular">{formatHours(client.seconds)}</TableCell>
                    <TableCell className="tabular">{formatMoney(client.money)}</TableCell>
                  </TableRow>
                  {client.projects.map((project) => (
                    <TableRow key={`${client.id}-${project.id}`}>
                      <TableCell className="pl-8 text-muted-foreground">{project.name}</TableCell>
                      <TableCell className="tabular">{formatHours(project.seconds)}</TableCell>
                      <TableCell className="tabular">{formatMoney(project.money)}</TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
          </div>
        )}
      </section>

      <section className="print:hidden">
        <h2 className="mb-2 text-sm font-medium">Requests</h2>
        <div className="grid gap-4 lg:grid-cols-4">
          {loading ? (
            <>
              <DonutSkeleton title="Requests by project" />
              <DonutSkeleton title="Requests by client" />
              <DonutSkeleton title="Requests by requester" />
              <DonutSkeleton title="Requests by activity" />
            </>
          ) : (
            <>
              <Donut
                title="Requests by project"
                slices={report.requestProjects}
                selectedId={projectId}
                onSelect={(id) => setProjectId(id === projectId ? '' : id)}
                formatValue={(count) => String(count)}
                emptyLabel="No requests."
              />
              <Donut
                title="Requests by client"
                slices={report.requestClients}
                selectedId={clientId}
                onSelect={(id) => setClientId(id === clientId ? '' : id)}
                formatValue={(count) => String(count)}
                emptyLabel="No requests."
              />
              <Donut
                title="Requests by requester"
                slices={report.requestRequesters}
                selectedId=""
                onSelect={() => undefined}
                formatValue={(count) => String(count)}
                emptyLabel="No requests."
              />
              <Donut
                title="Requests by activity"
                slices={report.requestActivities}
                selectedId={activityId}
                onSelect={(id) => setActivityId(id === activityId ? '' : id)}
                formatValue={(count) => String(count)}
                emptyLabel="No requests."
              />
            </>
          )}
        </div>
        <div className="mb-2 mt-4 flex items-center gap-1.5">
          <h3 className="text-sm font-medium">Request time</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground" aria-label="How request time is counted">
                  <InformationCircleIcon className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Time on a request is the entry’s duration split evenly across every request linked to that entry.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="grid gap-4 lg:grid-cols-4">
          {loading ? (
            <>
              <DonutSkeleton title="Request time by project" />
              <DonutSkeleton title="Request time by client" />
              <DonutSkeleton title="Request time by requester" />
              <DonutSkeleton title="Request time by activity" />
            </>
          ) : (
            <>
              <Donut
                title="Request time by project"
                slices={report.requestTime.projects}
                selectedId={projectId}
                onSelect={(id) => setProjectId(id === projectId ? '' : id)}
              />
              <Donut
                title="Request time by client"
                slices={report.requestTime.clients}
                selectedId={clientId}
                onSelect={(id) => setClientId(id === clientId ? '' : id)}
              />
              <Donut
                title="Request time by requester"
                slices={report.requestTime.requesters}
                selectedId=""
                onSelect={() => undefined}
              />
              <Donut
                title="Request time by activity"
                slices={report.requestTime.activities}
                selectedId={activityId}
                onSelect={(id) => setActivityId(id === activityId ? '' : id)}
              />
            </>
          )}
        </div>
      </section>

      <section className="print:hidden">
        <h2 className="mb-2 text-sm font-medium">Tasks</h2>
        <div className="grid gap-4 lg:grid-cols-4">
          {loading ? (
            <>
              <DonutSkeleton title="Tasks by project" />
              <DonutSkeleton title="Tasks by client" />
              <DonutSkeleton title="Tasks by requester" />
              <DonutSkeleton title="Tasks by activity" />
            </>
          ) : (
            <>
              <Donut
                title="Tasks by project"
                slices={report.taskProjects}
                selectedId={projectId}
                onSelect={(id) => setProjectId(id === projectId ? '' : id)}
                formatValue={(count) => String(count)}
                emptyLabel="No tasks."
              />
              <Donut
                title="Tasks by client"
                slices={report.taskClients}
                selectedId={clientId}
                onSelect={(id) => setClientId(id === clientId ? '' : id)}
                formatValue={(count) => String(count)}
                emptyLabel="No tasks."
              />
              <Donut
                title="Tasks by requester"
                slices={report.taskRequesters}
                selectedId=""
                onSelect={() => undefined}
                formatValue={(count) => String(count)}
                emptyLabel="No tasks."
              />
              <Donut
                title="Tasks by activity"
                slices={report.taskActivities}
                selectedId={activityId}
                onSelect={(id) => setActivityId(id === activityId ? '' : id)}
                formatValue={(count) => String(count)}
                emptyLabel="No tasks."
              />
            </>
          )}
        </div>
        <div className="mb-2 mt-4 flex items-center gap-1.5">
          <h3 className="text-sm font-medium">Task time</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground" aria-label="How task time is counted">
                  <InformationCircleIcon className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Time on a task is the entry’s duration split evenly across every task linked to that entry.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="grid gap-4 lg:grid-cols-4">
          {loading ? (
            <>
              <DonutSkeleton title="Task time by project" />
              <DonutSkeleton title="Task time by client" />
              <DonutSkeleton title="Task time by requester" />
              <DonutSkeleton title="Task time by activity" />
            </>
          ) : (
            <>
              <Donut
                title="Task time by project"
                slices={report.taskTime.projects}
                selectedId={projectId}
                onSelect={(id) => setProjectId(id === projectId ? '' : id)}
              />
              <Donut
                title="Task time by client"
                slices={report.taskTime.clients}
                selectedId={clientId}
                onSelect={(id) => setClientId(id === clientId ? '' : id)}
              />
              <Donut
                title="Task time by requester"
                slices={report.taskTime.requesters}
                selectedId=""
                onSelect={() => undefined}
              />
              <Donut
                title="Task time by activity"
                slices={report.taskTime.activities}
                selectedId={activityId}
                onSelect={(id) => setActivityId(id === activityId ? '' : id)}
              />
            </>
          )}
        </div>
      </section>

      {isAll ? (
        <p className="text-xs text-muted-foreground print:hidden">
          Showing memberships across {workspaces.length} workspaces.
        </p>
      ) : null}
    </div>
  )
}

function Filter({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-[10rem] flex-1 gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums whitespace-nowrap">{value}</p>
    </div>
  )
}

function SummarySkeleton({ label }: { label: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Skeleton className="mt-2 h-6 w-16" />
    </div>
  )
}

function pointOnCircle(cx: number, cy: number, radius: number, angle: number) {
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)] as const
}

function isFullRing(start: number, end: number) {
  return end - start >= Math.PI * 2 - 1e-4
}

function donutSlicePath(cx: number, cy: number, outer: number, inner: number, start: number, end: number) {
  const sweep = end - start
  const large = sweep > Math.PI ? 1 : 0
  const [x1, y1] = pointOnCircle(cx, cy, outer, start)
  const [x2, y2] = pointOnCircle(cx, cy, outer, end)
  const [x3, y3] = pointOnCircle(cx, cy, inner, end)
  const [x4, y4] = pointOnCircle(cx, cy, inner, start)
  return `M ${x1} ${y1} A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`
}

function Donut({
  title,
  slices,
  selectedId,
  onSelect,
  formatValue = formatHours,
  emptyLabel = 'No hours.',
}: {
  title: string
  slices: Bucket[]
  selectedId: string
  onSelect: (id: string) => void
  formatValue?: (value: number) => string
  emptyLabel?: string
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const total = slices.reduce((sum, slice) => sum + slice.seconds, 0)
  const arcs = useMemo(() => {
    let angle = -Math.PI / 2
    return slices.map((slice) => {
      const share = total > 0 ? slice.seconds / total : 0
      const start = angle
      angle += share * Math.PI * 2
      return { ...slice, start, end: angle, share }
    })
  }, [slices, total])
  const hovered = arcs.find((slice) => slice.id === hoveredId) ?? null

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="mb-3 text-sm font-medium">{title}</p>
      {slices.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative size-28 shrink-0">
            <svg viewBox="0 0 100 100" className="size-full" role="img" aria-label={title}>
              {arcs.map((slice) => {
                const full = isFullRing(slice.start, slice.end)
                const label = `${slice.label}: ${formatValue(slice.seconds)} (${Math.round(slice.share * 100)}%)`
                return full ? (
                  <circle
                    key={slice.id}
                    cx={50}
                    cy={50}
                    r={37}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth={18}
                    className="cursor-pointer transition-opacity duration-150"
                    opacity={hoveredId && hoveredId !== slice.id ? 0.3 : 1}
                    onMouseEnter={() => setHoveredId(slice.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => onSelect(slice.id)}
                  >
                    <title>{label}</title>
                  </circle>
                ) : (
                  <path
                    key={slice.id}
                    d={donutSlicePath(50, 50, 46, 28, slice.start, slice.end)}
                    fill={slice.color}
                    className="cursor-pointer transition-opacity duration-150"
                    opacity={hoveredId && hoveredId !== slice.id ? 0.3 : 1}
                    onMouseEnter={() => setHoveredId(slice.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => onSelect(slice.id)}
                  >
                    <title>{label}</title>
                  </path>
                )
              })}
            </svg>
            {hovered ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-3 text-center">
                <p className="text-[10px] leading-tight">
                  <span className="block truncate font-medium">{hovered.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatValue(hovered.seconds)} · {Math.round(hovered.share * 100)}%
                  </span>
                </p>
              </div>
            ) : null}
          </div>
          <ul className="min-w-0 max-h-[7.5rem] flex-1 space-y-0.5 overflow-y-auto">
            {arcs.map((slice) => (
              <li key={slice.id}>
                <button
                  type="button"
                  aria-pressed={selectedId === slice.id}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left text-xs hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
                    (hoveredId === slice.id || selectedId === slice.id) && 'bg-muted',
                    hoveredId && hoveredId !== slice.id && 'opacity-50',
                  )}
                  onMouseEnter={() => setHoveredId(slice.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(slice.id)}
                  onBlur={() => setHoveredId(null)}
                  onClick={() => onSelect(slice.id)}
                >
                  <span className="size-2 shrink-0 rounded-sm" style={{ background: slice.color }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{slice.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatValue(slice.seconds)} ({Math.round(slice.share * 100)}%)
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function DonutSkeleton({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="mb-3 text-sm font-medium">{title}</p>
      <div className="flex items-center gap-4">
        <Skeleton className="size-28 shrink-0 rounded-full" />
        <ul className="min-w-0 flex-1 space-y-2">
          <li>
            <Skeleton className="h-3 w-full" />
          </li>
          <li>
            <Skeleton className="h-3 w-4/5" />
          </li>
          <li>
            <Skeleton className="h-3 w-3/5" />
          </li>
        </ul>
      </div>
    </div>
  )
}

function ClientsSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client / project</TableHead>
            <TableHead>Hours</TableHead>
            <TableHead>Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }, (_, index) => (
            <TableRow key={index}>
              <TableCell>
                <Skeleton className="h-4 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-12" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

