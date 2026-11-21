import { ChevronDownIcon, InformationCircleIcon } from '@heroicons/react/24/outline'
import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth } from 'date-fns'
import { Fragment, useMemo, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { WorkspaceMark } from '@/components/workspaces/workspace-icon'
import { revealList } from '@/features/crypto/read-copy'
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

import { downloadChartReportPdf, downloadReportPdf } from './export-report-pdf'
import { NarrativeReportPrint } from './narrative-report-print'

const MAX_NARRATIVE_DAYS = 31
const NO_CLIENT = '__none__'
const NO_PROJECT = '__none_project__'
const NO_ACTIVITY = '__none_activity__'
const NO_REQUESTER = '__none_requester__'
const PALETTE = ['#1F7A4D', '#0F6B5C', '#1F5E7A', '#2F4A8A', '#5E3A8A', '#8A3A5E', '#B42318', '#9A4A12', '#7A6B1F', '#3D5A3A']

export type Money = Record<string, number>

type Share = {
  entry: TimeEntry
  clientId: string
  projectId: string
  activityId: string
  activity: string
  seconds: number
  amount: number
  currency: string
}

export type Bucket = { id: string; label: string; color: string; seconds: number }

type ProjectSplit = { id: string; name: string; seconds: number; money: Money }

type ClientSplit = { id: string; name: string; seconds: number; money: Money; projects: ProjectSplit[] }

type WorkRow = {
  id: string
  label: string
  project: string
  projectId: string
  activity: string
  activityId: string
  requester: string
  requesterId: string
  clientIds: string[]
  seconds: number
  money: Money
}

export type GroupBy =
  | 'client-project'
  | 'client-activity'
  | 'project-client'
  | 'project-activity'
  | 'project-client-activity'
  | 'project'
  | 'client'
  | 'requester'
  | 'activity'

const GROUP_KEY = 'report-group-by'
const GROUP_OPTIONS: GroupBy[] = [
  'client-project',
  'client-activity',
  'project-client',
  'project-activity',
  'project-client-activity',
  'project',
  'client',
  'requester',
  'activity',
]

function activityGroupKey(id: string, name: string) {
  return id === NO_ACTIVITY ? NO_ACTIVITY : name
}

function matchesIds(selected: string[], id: string) {
  return selected.length === 0 || selected.includes(id)
}

function matchesActivityFilters(filters: string[], id: string | null | undefined, name: string) {
  if (filters.length === 0) return true
  const key = id ?? NO_ACTIVITY
  const group = activityGroupKey(key, name)
  return filters.some((filter) => filter === key || filter === group)
}

function matchesClients(selected: string[], linked: string[]) {
  if (selected.length === 0) return true
  if (linked.length === 0) return selected.includes(NO_CLIENT)
  return linked.some((id) => selected.includes(id))
}

function clientIdsFor(selected: string[], ids: string[]) {
  const base = ids.length === 0 ? [NO_CLIENT] : ids
  if (selected.length === 0) return base
  return base.filter((id) => selected.includes(id))
}

function toggleId(selected: string[], id: string) {
  return selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]
}

function activityChosen(
  filters: string[],
  groupKey: string,
  label: string,
  activities: { id: string; name: string }[],
) {
  if (filters.length === 0) return false
  if (filters.includes(groupKey)) return true
  return filters.some((filter) => {
    const activity = activities.find((row) => row.id === filter)
    return activity ? activityGroupKey(activity.id, activity.name) === groupKey : filter === label
  })
}

function readGroupBy(): GroupBy {
  try {
    const stored = localStorage.getItem(GROUP_KEY)
    if (stored && GROUP_OPTIONS.includes(stored as GroupBy)) return stored as GroupBy
  } catch {
    /* ignore private mode */
  }
  return 'project-client'
}

function formatClock(seconds: number) {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

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

function storeGroupBy(value: GroupBy) {
  try {
    localStorage.setItem(GROUP_KEY, value)
  } catch {
    /* ignore quota / private mode */
  }
}

type ReportItem = {
  projectId: string
  project: string
  activityId: string
  activity: string
  requesterId: string
  requester: string
  clientIds: string[]
  done: boolean
}

function addMoney(map: Money, currency: string, amount: number) {
  if (!amount) return
  const key = currency || '—'
  map[key] = (map[key] ?? 0) + amount
}

export function formatMoney(map: Money) {
  const parts = Object.entries(map)
  if (parts.length === 0) return '0'
  return parts.map(([currency, amount]) => `${amount.toFixed(2)} ${currency}`).join(' · ')
}

export function ReportPage() {
  const { workspaceId, isAll, workspaces } = useWorkspace()
  const catalog = useCatalog()
  const [from, setFrom] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [to, setTo] = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([])
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [clientIds, setClientIds] = useState<string[]>([])
  const [activityIds, setActivityIds] = useState<string[]>([])
  const [groupBy, setGroupBy] = useState<GroupBy>(readGroupBy)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  const narrativeRangeDays = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1
  const narrativeRangeTooLong = narrativeRangeDays > MAX_NARRATIVE_DAYS

  const entries = useQuery({
    queryKey: qk.entries(workspaceId, `${from}-${to}`),
    queryFn: async () => {
      let q = supabase
        .from('time_entries')
        .select(
          '*, project:projects(*), activity:activities(*), time_entry_clients(client_id), time_entry_requests(request_id, request:requests(id, workspace_id, task_number, request, request_ciphertext, requester, requester_ciphertext, status, project_id, activity_id, project:projects(id, workspace_id, name, name_ciphertext), request_clients(client_id))), time_entry_tasks(task_id, task:tasks(id, workspace_id, task_number, task, task_ciphertext, requester, requester_ciphertext, status, project_id, activity_id, project:projects(id, workspace_id, name, name_ciphertext), task_clients(client_id)))',
        )
        .gte('started_at', `${from}T00:00:00`)
        .lte('started_at', `${to}T23:59:59`)
        .not('stopped_at', 'is', null)
      if (!isAll) q = q.eq('workspace_id', workspaceId)
      const { data, error } = await q
      if (error) throw error
      return revealList('time_entries', (data ?? []) as TimeEntry[])
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
      return revealList('requests', (data ?? []) as SupportRequest[])
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
      return revealList('tasks', (data ?? []) as Task[])
    },
  })

  const scopeWorkspaces = useMemo(
    () => (isAll ? workspaces : workspaces.filter((workspace) => workspace.id === workspaceId)),
    [isAll, workspaceId, workspaces],
  )
  const activeWorkspaceIds = useMemo(
    () => workspaceIds.filter((id) => scopeWorkspaces.some((workspace) => workspace.id === id)),
    [scopeWorkspaces, workspaceIds],
  )

  function inWorkspace(id: string) {
    return activeWorkspaceIds.length === 0 || activeWorkspaceIds.includes(id)
  }

  function chooseWorkspaces(next: string[]) {
    const allow = (id: string | undefined) => next.length === 0 || (id != null && next.includes(id))
    setWorkspaceIds(next)
    setProjectIds((current) =>
      current.filter((id) => id === NO_PROJECT || allow(catalog.allProjects.find((project) => project.id === id)?.workspace_id)),
    )
    setClientIds((current) =>
      current.filter((id) => id === NO_CLIENT || allow(catalog.clients.find((client) => client.id === id)?.workspace_id)),
    )
    setActivityIds((current) =>
      current.filter((id) => {
        if (id === NO_ACTIVITY) return true
        const activity = catalog.activities.find((row) => row.id === id)
        if (!activity) return true
        return allow(activity.workspace_id)
      }),
    )
  }

  const report = useMemo(() => {
    const included: TimeEntry[] = []
    const shares: Share[] = []

    function lookupActivityName(id: string | null | undefined, fallback?: string | null) {
      const key = id ?? NO_ACTIVITY
      if (key === NO_ACTIVITY) return 'No activity'
      return catalog.activities.find((activity) => activity.id === key)?.name ?? fallback ?? 'Unknown activity'
    }

    for (const entry of entries.data ?? []) {
      if (!matchesIds(activeWorkspaceIds, entry.workspace_id)) continue
      if (!matchesIds(projectIds, entry.project_id ?? NO_PROJECT)) continue
      const activityName = lookupActivityName(entry.activity_id, entry.activity?.name)
      if (!matchesActivityFilters(activityIds, entry.activity_id, activityName)) continue
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
          activity: activityName,
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

      const visible = clientIds.length === 0 ? next : next.filter((share) => clientIds.includes(share.clientId))
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

    for (const share of shares) share.activity = nameFor(share.activityId, 'activity')

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
      if (!matchesIds(activeWorkspaceIds, req.workspace_id)) return false
      if (!matchesIds(projectIds, req.project_id ?? NO_PROJECT)) return false
      if (!matchesActivityFilters(activityIds, req.activity_id, lookupActivityName(req.activity_id, req.activity?.name))) return false
      return matchesClients(clientIds, displayClientIds(req, catalog))
    })

    function requestClientIds(req: SupportRequest) {
      return clientIdsFor(clientIds, displayClientIds(req, catalog))
    }

    function requesterId(name: string | null | undefined) {
      const trimmed = name?.trim()
      return trimmed ? trimmed : NO_REQUESTER
    }

    function requesterLabel(id: string) {
      return id === NO_REQUESTER ? 'No requester' : id
    }

    function requestHours(rows: TimeEntry[], visibleShares: Share[]) {
      const totals = new Map<string, WorkRow>()
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
          const projectIdForRequest = full?.project_id ?? req?.project_id ?? NO_PROJECT
          const activityIdForRequest = full?.activity_id ?? req?.activity_id ?? NO_ACTIVITY
          const who = requesterId(full?.requester ?? req?.requester)
          const clientIds = full
            ? requestClientIds(full)
            : requestClientIds({
                project_id: req?.project_id ?? null,
                activity_id: req?.activity_id ?? null,
                request_clients: req?.request_clients,
              } as SupportRequest)
          const current = totals.get(id) ?? {
            id,
            label: req ? `${requestCode(req.task_number, workspaces.find((workspace) => workspace.id === entry.workspace_id)?.id_code ?? '')} · ${req.request}` : 'Request',
            project: nameFor(projectIdForRequest, 'project'),
            projectId: projectIdForRequest,
            activity: nameFor(activityIdForRequest, 'activity'),
            activityId: activityIdForRequest,
            requester: requesterLabel(who),
            requesterId: who,
            clientIds: clientIds.length > 0 ? clientIds : [NO_CLIENT],
            seconds: 0,
            money: {},
          }
          current.seconds += seconds
          for (const share of entryShares) addMoney(current.money, share.currency, share.amount / shareCount)
          totals.set(id, current)
        }
      }
      return [...totals.values()].sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label))
    }

    const filteredTasks = (tasks.data ?? []).filter((task) => {
      if (!matchesIds(activeWorkspaceIds, task.workspace_id)) return false
      if (!matchesIds(projectIds, task.project_id ?? NO_PROJECT)) return false
      if (!matchesActivityFilters(activityIds, task.activity_id, lookupActivityName(task.activity_id, task.activity?.name))) return false
      return matchesClients(clientIds, displayClientIds(task, catalog))
    })

    function taskClientIds(task: Task) {
      return clientIdsFor(clientIds, displayClientIds(task, catalog))
    }

    function taskHours(rows: TimeEntry[], visibleShares: Share[]) {
      const totals = new Map<string, WorkRow>()
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
          const projectIdForTask = full?.project_id ?? task?.project_id ?? NO_PROJECT
          const activityIdForTask = full?.activity_id ?? task?.activity_id ?? NO_ACTIVITY
          const who = requesterId(full?.requester ?? task?.requester)
          const clientIds = full
            ? taskClientIds(full)
            : taskClientIds({
                project_id: task?.project_id ?? null,
                activity_id: task?.activity_id ?? null,
                task_clients: task?.task_clients,
              } as Task)
          const current = totals.get(id) ?? {
            id,
            label: task ? `${taskCode(task.task_number, workspaces.find((workspace) => workspace.id === entry.workspace_id)?.id_code ?? '')} · ${task.task}` : 'Task',
            project: nameFor(projectIdForTask, 'project'),
            projectId: projectIdForTask,
            activity: nameFor(activityIdForTask, 'activity'),
            activityId: activityIdForTask,
            requester: requesterLabel(who),
            requesterId: who,
            clientIds: clientIds.length > 0 ? clientIds : [NO_CLIENT],
            seconds: 0,
            money: {},
          }
          current.seconds += seconds
          for (const share of entryShares) addMoney(current.money, share.currency, share.amount / shareCount)
          totals.set(id, current)
        }
      }
      return [...totals.values()].sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label))
    }

    function toItem(projectId: string | null, activityId: string | null, requester: string | null | undefined, clientIds: string[], done: boolean): ReportItem {
      const projectKey = projectId ?? NO_PROJECT
      const activityKey = activityId ?? NO_ACTIVITY
      const who = requesterId(requester)
      return {
        projectId: projectKey,
        project: nameFor(projectKey, 'project'),
        activityId: activityKey,
        activity: nameFor(activityKey, 'activity'),
        requesterId: who,
        requester: requesterLabel(who),
        clientIds: clientIds.length > 0 ? clientIds : [NO_CLIENT],
        done,
      }
    }

    return {
      totalSeconds,
      billableSeconds,
      money,
      requestCount: filteredRequests.length,
      taskCount: filteredTasks.length,
      completedCount: filteredTasks.filter((task) => task.status === 'done').length,
      requestItems: filteredRequests.map((req) => toItem(req.project_id, req.activity_id, req.requester, requestClientIds(req), false)),
      taskItems: filteredTasks.map((task) => toItem(task.project_id, task.activity_id, task.requester, taskClientIds(task), task.status === 'done')),
      projects: buckets('project'),
      clients: buckets('client'),
      activities: buckets('activity'),
      clientSplits,
      shares,
      requestTime: requestHours(included, shares),
      taskTime: taskHours(included, shares),
      included,
    }
  }, [
    activeWorkspaceIds,
    activityIds,
    catalog.activities,
    catalog.allProjects,
    catalog.clients,
    catalog.projectClients,
    clientIds,
    entries.data,
    projectIds,
    requests.data,
    tasks.data,
    workspaces,
  ])

  const loading = entries.isPending || requests.isPending || tasks.isPending || catalog.loading
  const reportWorkspaceName = useMemo(() => {
    const chosen =
      activeWorkspaceIds.length === 0
        ? scopeWorkspaces
        : scopeWorkspaces.filter((workspace) => activeWorkspaceIds.includes(workspace.id))
    if (chosen.length === 1) return chosen[0]?.name ?? 'Workspace'
    if (isAll && chosen.length === workspaces.length) return 'All workspaces'
    return chosen.map((workspace) => workspace.name).join(', ') || 'All workspaces'
  }, [activeWorkspaceIds, isAll, scopeWorkspaces, workspaces.length])

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
    for (const row of report.taskTime) {
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
    for (const row of report.requestTime) {
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

  function narrativeCsv() {
    const header = [
      'started_at',
      'stopped_at',
      'duration',
      'hours',
      'description',
      'client',
      'project',
      'activity',
      'task_id',
      'task_number',
      'task',
      'task_requester',
      'task_status',
      'request_id',
      'request_number',
      'request',
      'request_requester',
      'request_status',
      'billable',
      'entry_id',
    ]
    const cell = (value: string) => `"${value.replaceAll('"', '""')}"`
    const lines = [header.join(',')]
    const sharesByEntry = new Map<string, Share[]>()
    for (const share of report.shares) {
      const rows = sharesByEntry.get(share.entry.id) ?? []
      rows.push(share)
      sharesByEntry.set(share.entry.id, rows)
    }
    for (const entry of report.included) {
      const shares = sharesByEntry.get(entry.id) ?? []
      const clients = [
        ...new Set(
          shares
            .filter((share) => share.clientId !== NO_CLIENT)
            .map((share) => clientName(share.clientId))
            .filter((name) => name && name !== 'No client'),
        ),
      ]
      const activity =
        (entry.activity_id ?? NO_ACTIVITY) === NO_ACTIVITY
          ? ''
          : shares.find((share) => share.activity)?.activity ?? entry.activity?.name ?? ''
      const tasks = [...(entry.time_entry_tasks ?? [])].sort(
        (a, b) => (a.task?.task_number ?? 0) - (b.task?.task_number ?? 0),
      )
      const requests = [...(entry.time_entry_requests ?? [])].sort(
        (a, b) => (a.request?.task_number ?? 0) - (b.request?.task_number ?? 0),
      )
      const seconds = entry.duration_seconds ?? 0
      lines.push(
        [
          entry.started_at,
          entry.stopped_at ?? '',
          formatClock(seconds),
          (seconds / 3600).toFixed(2),
          entry.description ?? '',
          clients.join('; '),
          entry.project?.name ?? '',
          activity,
          tasks.map((link) => link.task_id).join('; '),
          tasks.map((link) => (link.task ? taskCode(link.task.task_number, workspaces.find((workspace) => workspace.id === entry.workspace_id)?.id_code ?? '') : '')).join('; '),
          tasks.map((link) => link.task?.task ?? '').join('; '),
          tasks.map((link) => link.task?.requester ?? '').join('; '),
          tasks.map((link) => link.task?.status ?? '').join('; '),
          requests.map((link) => link.request_id).join('; '),
          requests.map((link) => (link.request ? requestCode(link.request.task_number, workspaces.find((workspace) => workspace.id === entry.workspace_id)?.id_code ?? '') : '')).join('; '),
          requests.map((link) => link.request?.request ?? '').join('; '),
          requests.map((link) => link.request?.requester ?? '').join('; '),
          requests.map((link) => link.request?.status ?? '').join('; '),
          String(entry.billable),
          entry.id,
        ]
          .map((value) => cell(value))
          .join(','),
      )
    }
    return lines.join('\n')
  }

  async function generateNarrative(layout: 'text' | 'full' = 'text') {
    if (narrativeRangeTooLong) {
      toast.error('Could not generate the report', { description: `Pick a range of ${MAX_NARRATIVE_DAYS} days or less.` })
      return
    }
    if (report.included.length === 0) {
      toast.error('Could not generate the report', { description: 'No time entries in this range.' })
      return
    }
    setGeneratingReport(true)
    try {
      const { data, error } = await supabase.functions.invoke('generate-report', {
        body: {
          csv: narrativeCsv(),
          from,
          to,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          today: format(new Date(), 'yyyy-MM-dd'),
          workspace_id: activeWorkspaceIds.length === 1 ? activeWorkspaceIds[0] : isAll ? null : workspaceId,
        },
      })
      if (error) throw new Error(await failureMessage(error))
      if (data?.error) throw new Error(String(data.error))
      const markdown = String(data?.markdown ?? '').trim()
      if (!markdown) throw new Error('The report came back empty.')
      const workspaceName = reportWorkspaceName
      if (layout === 'full') {
        await downloadChartReportPdf(
          {
            from,
            to,
            workspaceName,
            report,
            groupBy,
            projectColor,
            clientName,
            narrative: markdown,
          },
          `miravize_full_report_${from}_to_${to}.pdf`,
        )
      } else {
        await downloadReportPdf(
          <NarrativeReportPrint workspaceName={workspaceName} markdown={markdown} />,
          `miravize_work_report_${from}_to_${to}.pdf`,
        )
      }
    } catch (error) {
      toast.error('Could not generate the report', { description: error instanceof Error ? error.message : 'Something went wrong.' })
    } finally {
      setGeneratingReport(false)
    }
  }

  async function exportPdf() {
    setExportingPdf(true)
    try {
      await downloadChartReportPdf(
        {
          from,
          to,
          workspaceName: reportWorkspaceName,
          report,
          groupBy,
          projectColor,
          clientName,
        },
        `miravize_report_${from}_to_${to}.pdf`,
      )
    } catch (error) {
      toast.error('Could not export the PDF', { description: error instanceof Error ? error.message : 'Something went wrong.' })
    } finally {
      setExportingPdf(false)
    }
  }

  const projectColor = (id: string) => catalog.allProjects.find((project) => project.id === id)?.color
  const clientName = (id: string) =>
    id === NO_CLIENT ? 'No client' : catalog.clients.find((client) => client.id === id)?.name ?? 'Unknown client'
  const workspaceName = (id: string) => workspaces.find((workspace) => workspace.id === id)?.name

  function tagged(name: string, workspaceId: string, many: boolean) {
    if (!many) return name
    const workspace = workspaceName(workspaceId)
    return workspace ? `${name} · ${workspace}` : name
  }

  const workspaceOptions: MultiSelectOption[] = scopeWorkspaces.map((workspace) => ({
    value: workspace.id,
    label: workspace.name,
    leading: <WorkspaceMark icon={workspace.icon} />,
  }))
  const projectChoices = catalog.projects.filter((project) => inWorkspace(project.workspace_id))
  const clientChoices = catalog.clients.filter((client) => inWorkspace(client.workspace_id))
  const activityChoices = catalog.activities.filter((activity) => inWorkspace(activity.workspace_id))
  const manyProjects = new Set(projectChoices.map((project) => project.workspace_id)).size > 1
  const manyClients = new Set(clientChoices.map((client) => client.workspace_id)).size > 1
  const manyActivities = new Set(activityChoices.map((activity) => activity.workspace_id)).size > 1
  const projectOptions: MultiSelectOption[] = [
    { value: NO_PROJECT, label: 'No project' },
    ...projectChoices.map((project) => ({
      value: project.id,
      label: tagged(project.name, project.workspace_id, manyProjects),
      leading: <span className="size-2 shrink-0 rounded-sm" style={{ background: project.color }} aria-hidden="true" />,
    })),
  ]
  const clientOptions: MultiSelectOption[] = [
    { value: NO_CLIENT, label: 'No client' },
    ...clientChoices.map((client) => ({
      value: client.id,
      label: tagged(client.name, client.workspace_id, manyClients),
    })),
  ]
  const activityOptions: MultiSelectOption[] = [
    { value: NO_ACTIVITY, label: 'No activity' },
    ...activityChoices.map((activity) => ({
      value: activity.id,
      label: tagged(
        activity.client_id
          ? `${activity.name} · ${catalog.clients.find((client) => client.id === activity.client_id)?.name ?? ''}`
          : activity.name,
        activity.workspace_id,
        manyActivities,
      ),
    })),
  ]
  for (const id of activityIds) {
    if (!activityOptions.some((option) => option.value === id)) activityOptions.push({ value: id, label: id })
  }

  function toggleActivity(current: string[], id: string) {
    const groupOf = (filter: string) => {
      if (filter === NO_ACTIVITY) return NO_ACTIVITY
      const activity = catalog.activities.find((row) => row.id === filter)
      return activity ? activityGroupKey(activity.id, activity.name) : filter
    }
    const group = groupOf(id)
    return current.some((filter) => groupOf(filter) === group)
      ? current.filter((filter) => groupOf(filter) !== group)
      : [...current, id]
  }

  function lineSelected(line: { filter: Line['filter']; filterId: string; label: string }) {
    if (line.filter === 'project') return projectIds.includes(line.filterId)
    if (line.filter === 'client') return clientIds.includes(line.filterId)
    if (line.filter === 'activity') return activityChosen(activityIds, line.filterId, line.label, catalog.activities)
    return false
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
        <Filter label="Workspace">
          <MultiSelect
            label="Workspace"
            values={activeWorkspaceIds}
            onChange={chooseWorkspaces}
            options={workspaceOptions}
            allLabel="All workspaces"
            noun="workspaces"
          />
        </Filter>
        <Filter label="Project">
          <MultiSelect
            label="Project"
            values={projectIds}
            onChange={setProjectIds}
            options={projectOptions}
            allLabel="All projects"
            noun="projects"
          />
        </Filter>
        <Filter label="Client">
          <MultiSelect
            label="Client"
            values={clientIds}
            onChange={setClientIds}
            options={clientOptions}
            allLabel="All clients"
            noun="clients"
          />
        </Filter>
        <Filter label="Activity">
          <MultiSelect
            label="Activity"
            values={activityIds}
            onChange={setActivityIds}
            options={activityOptions}
            allLabel="All activities"
            noun="activities"
          />
        </Filter>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={report.clientSplits.length === 0 && report.requestCount === 0 && report.requestTime.length === 0 && report.taskCount === 0 && report.taskTime.length === 0}
          >
            Export CSV
          </Button>
          <div className="flex">
            <Button
              className="rounded-r-none"
              onClick={() => void exportPdf()}
              disabled={loading || exportingPdf || generatingReport}
            >
              {exportingPdf ? 'Exporting PDF' : generatingReport ? 'Generating report' : 'Export PDF'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  className="rounded-l-none border-l border-primary-foreground/30 px-2"
                  aria-label="More report exports"
                  disabled={loading || exportingPdf || generatingReport}
                >
                  <ChevronDownIcon aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72" filter={false}>
                <DropdownMenuItem
                  className="items-start"
                  disabled={narrativeRangeTooLong}
                  onSelect={() => void generateNarrative('text')}
                >
                  <span className="flex flex-col items-start gap-0.5">
                    <span>Written Report</span>
                    <span className="text-xs text-muted-foreground">
                      {narrativeRangeTooLong ? `Max ${MAX_NARRATIVE_DAYS} days` : 'Detailed summary of work performed'}
                    </span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="items-start"
                  disabled={narrativeRangeTooLong}
                  onSelect={() => void generateNarrative('full')}
                >
                  <span className="flex flex-col items-start gap-0.5">
                    <span>Complete Report</span>
                    <span className="text-xs text-muted-foreground">
                      {narrativeRangeTooLong ? `Max ${MAX_NARRATIVE_DAYS} days` : 'Charts, statistics, and written summary'}
                    </span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
              selected={(slice) => projectIds.includes(slice.id)}
              onSelect={(id) => setProjectIds((current) => toggleId(current, id))}
            />
            <Donut
              title="Hours by client"
              slices={report.clients}
              selected={(slice) => clientIds.includes(slice.id)}
              onSelect={(id) => setClientIds((current) => toggleId(current, id))}
            />
            <Donut
              title="Hours by activity"
              slices={report.activities}
              selected={(slice) =>
                activityIds.includes(slice.id) || activityIds.includes(activityGroupKey(slice.id, slice.label))
              }
              onSelect={(id) => setActivityIds((current) => toggleActivity(current, id))}
            />
          </>
        )}
      </div>

      <ReportTable
        report={report}
        groupBy={groupBy}
        onGroupBy={(value) => {
          setGroupBy(value)
          storeGroupBy(value)
        }}
        projectColor={projectColor}
        clientName={clientName}
        lineSelected={lineSelected}
        onProject={(id) => setProjectIds((current) => toggleId(current, id))}
        onClient={(id) => setClientIds((current) => toggleId(current, id))}
        onActivity={(id) => setActivityIds((current) => toggleActivity(current, id))}
        loading={loading}
      />

      {isAll ? (
        <p className="text-xs text-muted-foreground print:hidden">
          Showing memberships across {activeWorkspaceIds.length === 0 ? workspaces.length : activeWorkspaceIds.length}{' '}
          {activeWorkspaceIds.length === 1 ? 'workspace' : 'workspaces'}.
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

export function pointOnCircle(cx: number, cy: number, radius: number, angle: number) {
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)] as const
}

export function isFullRing(start: number, end: number) {
  return end - start >= Math.PI * 2 - 1e-4
}

export function donutSlicePath(cx: number, cy: number, outer: number, inner: number, start: number, end: number) {
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
  selected,
  onSelect,
  formatValue = formatHours,
  emptyLabel = 'No hours.',
}: {
  title: string
  slices: Bucket[]
  selected: (slice: Bucket) => boolean
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
          <ul className="max-h-[7.5rem] min-w-0 flex-1 space-y-0.5 overflow-y-auto">
            {arcs.map((slice) => (
              <li key={slice.id}>
                <button
                  type="button"
                  aria-pressed={selected(slice)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left text-xs hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
                    (hoveredId === slice.id || selected(slice)) && 'bg-muted',
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

function ShareBar({ seconds, total, color }: { seconds: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.round((seconds / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full max-w-24 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', !color && 'bg-foreground/80')}
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-xs tabular text-muted-foreground">{pct}%</span>
    </div>
  )
}

export const GROUP_LABEL: Record<GroupBy, string> = {
  'client-project': 'Client / project',
  'client-activity': 'Client / activity',
  'project-client': 'Project / clients',
  'project-activity': 'Project / activity',
  'project-client-activity': 'Project / clients / activity',
  project: 'Project',
  client: 'Client',
  requester: 'Requester',
  activity: 'Activity',
}

export type Line = {
  key: string
  filterId: string
  label: string
  depth: number
  color?: string
  billing: boolean
  seconds: number
  money: Money
  requests: number
  requestSeconds: number
  tasks: number
  completed: number
  taskSeconds: number
  filter: 'project' | 'client' | 'activity' | null
  children: Line[]
}

function blankLine(key: string, filterId: string, label: string, billing: boolean): Line {
  return {
    key,
    filterId,
    label,
    depth: 0,
    billing,
    seconds: 0,
    money: {},
    requests: 0,
    requestSeconds: 0,
    tasks: 0,
    completed: 0,
    taskSeconds: 0,
    filter: null,
    children: [],
  }
}

function hasFigures(line: Line) {
  return (
    line.seconds > 0 ||
    Object.keys(line.money).length > 0 ||
    line.requests > 0 ||
    line.requestSeconds > 0 ||
    line.tasks > 0 ||
    line.completed > 0 ||
    line.taskSeconds > 0
  )
}

function moneyBy(shares: Share[], key: (share: Share) => string) {
  const map = new Map<string, Money>()
  for (const share of shares) {
    const id = key(share)
    const money = map.get(id) ?? {}
    addMoney(money, share.currency, share.amount)
    map.set(id, money)
  }
  return map
}

function ReportTable({
  report,
  groupBy,
  onGroupBy,
  projectColor,
  clientName,
  lineSelected,
  onProject,
  onClient,
  onActivity,
  loading,
}: {
  report: {
    totalSeconds: number
    money: Money
    requestCount: number
    taskCount: number
    completedCount: number
    projects: Bucket[]
    activities: Bucket[]
    clientSplits: ClientSplit[]
    shares: Share[]
    requestTime: WorkRow[]
    taskTime: WorkRow[]
    requestItems: ReportItem[]
    taskItems: ReportItem[]
  }
  groupBy: GroupBy
  onGroupBy: (value: GroupBy) => void
  projectColor: (id: string) => string | undefined
  clientName: (id: string) => string
  lineSelected: (line: Pick<Line, 'filter' | 'filterId' | 'label'>) => boolean
  onProject: (id: string) => void
  onClient: (id: string) => void
  onActivity: (id: string) => void
  loading: boolean
}) {
  const rows = buildLines(report, groupBy, projectColor, clientName)
  const empty = rows.length === 0 && report.totalSeconds === 0 && report.requestCount === 0 && report.taskCount === 0
  const requestSeconds = report.requestTime.reduce((sum, row) => sum + row.seconds, 0)
  const taskSeconds = report.taskTime.reduce((sum, row) => sum + row.seconds, 0)
  return (
    <section className="flex min-h-[18rem] flex-1 flex-col">
      <div className="mb-2 flex shrink-0 items-center gap-3">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-medium">Breakdown</h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground" aria-label="How the breakdown is counted">
                  <InformationCircleIcon className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Requests and tasks include items without logged time. When multiple items are linked to the same time entry, the logged hours are divided equally among them to avoid double-counting. Total hours and amount reflect all logged time. Requesters do not have total hours or amounts.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="ml-auto flex items-center gap-2 print:hidden">
          <Label htmlFor="breakdown-group" className="shrink-0 text-xs text-muted-foreground">
            Group by
          </Label>
          <Select value={groupBy} onValueChange={(value) => onGroupBy(value as GroupBy)}>
            <SelectTrigger id="breakdown-group" aria-label="Group the breakdown by" className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="client-project">Client / project</SelectItem>
              <SelectItem value="client-activity">Client / activity</SelectItem>
              <SelectItem value="project-client">Project / clients</SelectItem>
              <SelectItem value="project-activity">Project / activity</SelectItem>
              <SelectItem value="project-client-activity">Project / clients / activity</SelectItem>
              <SelectItem value="project">Project</SelectItem>
              <SelectItem value="client">Client</SelectItem>
              <SelectItem value="requester">Requester</SelectItem>
              <SelectItem value="activity">Activity</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {loading ? (
        <ReportSkeleton />
      ) : empty ? (
        <p className="text-sm text-muted-foreground">No time, requests, or tasks in this range.</p>
      ) : (
        <div className="min-h-[18rem] flex-1 overflow-auto rounded-lg border border-border bg-card print:max-h-none print:min-h-0 print:overflow-visible">
          <Table className="min-w-[72rem]">
            <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card">
              <TableRow>
                <TableHead>{GROUP_LABEL[groupBy]}</TableHead>
                <TableHead className="w-40">Total share</TableHead>
                <TableHead className="w-28 text-right">Total hours</TableHead>
                <TableHead className="w-36 text-right">Amount</TableHead>
                <TableHead className="w-24 text-right">Requests</TableHead>
                <TableHead className="w-32 text-right">Request hours</TableHead>
                <TableHead className="w-24 text-right">Tasks</TableHead>
                <TableHead className="w-28 text-right">Completed</TableHead>
                <TableHead className="w-28 text-right">Task hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <ReportRows
                lines={rows}
                totalSeconds={report.totalSeconds}
                lineSelected={lineSelected}
                onProject={onProject}
                onClient={onClient}
                onActivity={onActivity}
              />
            </TableBody>
            <tfoot>
              <TableRow className="sticky bottom-0 z-10 border-t border-border bg-card font-medium">
                <TableCell>Total</TableCell>
                <TableCell>
                  <ShareBar seconds={report.totalSeconds} total={report.totalSeconds} />
                </TableCell>
                <TableCell className="text-right tabular">{formatHours(report.totalSeconds)}</TableCell>
                <TableCell className="text-right tabular">{formatMoney(report.money)}</TableCell>
                <TableCell className="text-right tabular">{report.requestCount}</TableCell>
                <TableCell className="text-right tabular">{formatHours(requestSeconds)}</TableCell>
                <TableCell className="text-right tabular">{report.taskCount}</TableCell>
                <TableCell className="text-right tabular">{report.completedCount}</TableCell>
                <TableCell className="text-right tabular">{formatHours(taskSeconds)}</TableCell>
              </TableRow>
            </tfoot>
          </Table>
        </div>
      )}
    </section>
  )
}

function ReportRows({
  lines,
  totalSeconds,
  lineSelected,
  onProject,
  onClient,
  onActivity,
}: {
  lines: Line[]
  totalSeconds: number
  lineSelected: (line: Pick<Line, 'filter' | 'filterId' | 'label'>) => boolean
  onProject: (id: string) => void
  onClient: (id: string) => void
  onActivity: (id: string) => void
}) {
  return lines.map((line) => (
    <Fragment key={line.key}>
      <ReportLine
        line={line}
        totalSeconds={totalSeconds}
        lineSelected={lineSelected}
        onProject={onProject}
        onClient={onClient}
        onActivity={onActivity}
      />
      {line.children.length > 0 ? (
        <ReportRows
          lines={line.children}
          totalSeconds={totalSeconds}
          lineSelected={lineSelected}
          onProject={onProject}
          onClient={onClient}
          onActivity={onActivity}
        />
      ) : null}
    </Fragment>
  ))
}

function ReportLine({
  line,
  totalSeconds,
  lineSelected,
  onProject,
  onClient,
  onActivity,
}: {
  line: Line
  totalSeconds: number
  lineSelected: (line: Pick<Line, 'filter' | 'filterId' | 'label'>) => boolean
  onProject: (id: string) => void
  onClient: (id: string) => void
  onActivity: (id: string) => void
}) {
  const onSelect = line.filter === 'project' ? onProject : line.filter === 'client' ? onClient : line.filter === 'activity' ? onActivity : null
  const selected = lineSelected(line)
  return (
    <TableRow
      aria-pressed={onSelect ? selected : undefined}
      tabIndex={onSelect ? 0 : undefined}
      className={cn(
        line.depth === 0 ? 'font-medium' : 'text-muted-foreground',
        onSelect && 'cursor-pointer hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
        selected && 'bg-muted',
      )}
      onClick={onSelect ? () => onSelect(line.filterId) : undefined}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(line.filterId)
              }
            }
          : undefined
      }
    >
      <TableCell className={cn('overflow-hidden', line.depth === 1 && 'pl-8 font-normal', line.depth === 2 && 'pl-14 font-normal')}>
        <span className="block truncate">{line.label}</span>
      </TableCell>
      <TableCell>{line.billing ? <ShareBar seconds={line.seconds} total={totalSeconds} color={line.color} /> : '—'}</TableCell>
      <TableCell className="text-right tabular">{line.billing ? formatHours(line.seconds) : '—'}</TableCell>
      <TableCell className="text-right tabular">{line.billing ? formatMoney(line.money) : '—'}</TableCell>
      <TableCell className="text-right tabular">{line.requests}</TableCell>
      <TableCell className="text-right tabular">{formatHours(line.requestSeconds)}</TableCell>
      <TableCell className="text-right tabular">{line.tasks}</TableCell>
      <TableCell className="text-right tabular">{line.completed}</TableCell>
      <TableCell className="text-right tabular">{formatHours(line.taskSeconds)}</TableCell>
    </TableRow>
  )
}

export function buildLines(
  report: {
    projects: Bucket[]
    activities: Bucket[]
    clientSplits: ClientSplit[]
    shares: Share[]
    requestTime: WorkRow[]
    taskTime: WorkRow[]
    requestItems: ReportItem[]
    taskItems: ReportItem[]
  },
  groupBy: GroupBy,
  projectColor: (id: string) => string | undefined,
  clientName: (id: string) => string,
) {
  if (groupBy === 'client-project') return clientProjectLines(report, projectColor, clientName)
  if (groupBy === 'client-activity') return clientActivityLines(report, clientName)
  if (groupBy === 'project-client' || groupBy === 'project-client-activity' || groupBy === 'project-activity') {
    return projectTree(report, projectColor, clientName, {
      withClients: groupBy !== 'project-activity',
      withActivity: groupBy !== 'project-client',
    })
  }
  return flatLines(report, groupBy, clientName)
}

function clientProjectLines(
  report: {
    clientSplits: ClientSplit[]
    requestTime: WorkRow[]
    taskTime: WorkRow[]
    requestItems: ReportItem[]
    taskItems: ReportItem[]
  },
  projectColor: (id: string) => string | undefined,
  clientName: (id: string) => string,
) {
  const clients = new Map<string, Line & { projectMap: Map<string, Line> }>()
  function clientLine(id: string, label: string) {
    const current = clients.get(id)
    if (current) return current
    const line = { ...blankLine(id, id, label, true), filter: 'client' as const, projectMap: new Map<string, Line>() }
    clients.set(id, line)
    return line
  }
  function projectLine(client: Line & { projectMap: Map<string, Line> }, id: string, label: string) {
    const current = client.projectMap.get(id)
    if (current) return current
    const line = { ...blankLine(`${client.key}-${id}`, id, label, true), depth: 1, filter: 'project' as const, color: projectColor(id) }
    client.projectMap.set(id, line)
    return line
  }
  for (const client of report.clientSplits) {
    const line = clientLine(client.id, client.name)
    line.seconds = client.seconds
    line.money = { ...client.money }
    for (const project of client.projects) {
      const child = projectLine(line, project.id, project.name)
      child.seconds = project.seconds
      child.money = { ...project.money }
    }
  }
  function count(item: ReportItem, kind: 'request' | 'task') {
    for (const clientId of item.clientIds) {
      const client = clientLine(clientId, clientName(clientId))
      const project = projectLine(client, item.projectId, item.project)
      if (kind === 'request') {
        client.requests += 1
        project.requests += 1
      } else {
        client.tasks += 1
        project.tasks += 1
        if (item.done) {
          client.completed += 1
          project.completed += 1
        }
      }
    }
  }
  for (const item of report.requestItems) count(item, 'request')
  for (const item of report.taskItems) count(item, 'task')
  function hours(row: WorkRow, kind: 'request' | 'task') {
    const ids = row.clientIds.length > 0 ? row.clientIds : [NO_CLIENT]
    const share = row.seconds / ids.length
    for (const clientId of ids) {
      const client = clientLine(clientId, clientName(clientId))
      const project = projectLine(client, row.projectId, row.project)
      if (kind === 'request') {
        client.requestSeconds += share
        project.requestSeconds += share
      } else {
        client.taskSeconds += share
        project.taskSeconds += share
      }
    }
  }
  for (const row of report.requestTime) hours(row, 'request')
  for (const row of report.taskTime) hours(row, 'task')
  return [...clients.values()]
    .map((client) => ({
      ...client,
      children: [...client.projectMap.values()]
        .filter(hasFigures)
        .sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label)),
    }))
    .filter(hasFigures)
    .sort((a, b) => a.label.localeCompare(b.label))
}

function clientActivityLines(
  report: {
    clientSplits: ClientSplit[]
    shares: Share[]
    requestTime: WorkRow[]
    taskTime: WorkRow[]
    requestItems: ReportItem[]
    taskItems: ReportItem[]
  },
  clientName: (id: string) => string,
) {
  const clients = new Map<string, Line & { activityMap: Map<string, Line> }>()
  function clientLine(id: string, label: string) {
    const current = clients.get(id)
    if (current) return current
    const line = { ...blankLine(id, id, label, true), filter: 'client' as const, activityMap: new Map<string, Line>() }
    clients.set(id, line)
    return line
  }
  function activityLine(client: Line & { activityMap: Map<string, Line> }, id: string, label: string) {
    const key = activityGroupKey(id, label)
    const current = client.activityMap.get(key)
    if (current) return current
    const line = { ...blankLine(`${client.key}-${key}`, key, label, true), depth: 1, filter: 'activity' as const }
    client.activityMap.set(key, line)
    return line
  }
  for (const client of report.clientSplits) {
    const line = clientLine(client.id, client.name)
    line.seconds = client.seconds
    line.money = { ...client.money }
  }
  for (const share of report.shares) {
    const client = clientLine(share.clientId, clientName(share.clientId))
    const activity = activityLine(client, share.activityId, share.activity)
    activity.seconds += share.seconds
    addMoney(activity.money, share.currency, share.amount)
  }
  function count(item: ReportItem, kind: 'request' | 'task') {
    for (const clientId of item.clientIds) {
      const client = clientLine(clientId, clientName(clientId))
      const activity = activityLine(client, item.activityId, item.activity)
      if (kind === 'request') {
        client.requests += 1
        activity.requests += 1
      } else {
        client.tasks += 1
        activity.tasks += 1
        if (item.done) {
          client.completed += 1
          activity.completed += 1
        }
      }
    }
  }
  for (const item of report.requestItems) count(item, 'request')
  for (const item of report.taskItems) count(item, 'task')
  function hours(row: WorkRow, kind: 'request' | 'task') {
    const ids = row.clientIds.length > 0 ? row.clientIds : [NO_CLIENT]
    const share = row.seconds / ids.length
    for (const clientId of ids) {
      const client = clientLine(clientId, clientName(clientId))
      const activity = activityLine(client, row.activityId, row.activity)
      if (kind === 'request') {
        client.requestSeconds += share
        activity.requestSeconds += share
      } else {
        client.taskSeconds += share
        activity.taskSeconds += share
      }
    }
  }
  for (const row of report.requestTime) hours(row, 'request')
  for (const row of report.taskTime) hours(row, 'task')
  return [...clients.values()]
    .map((client) => ({
      ...client,
      children: [...client.activityMap.values()]
        .filter(hasFigures)
        .sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label)),
    }))
    .filter(hasFigures)
    .sort((a, b) => a.label.localeCompare(b.label))
}

function projectTree(
  report: {
    projects: Bucket[]
    shares: Share[]
    requestTime: WorkRow[]
    taskTime: WorkRow[]
    requestItems: ReportItem[]
    taskItems: ReportItem[]
  },
  projectColor: (id: string) => string | undefined,
  clientName: (id: string) => string,
  options: { withClients: boolean; withActivity: boolean },
) {
  const { withClients, withActivity } = options
  const projects = new Map<string, Line>()
  const projectNames = new Map(report.projects.map((bucket) => [bucket.id, bucket.label]))
  function child(parent: Line, id: string, label: string, filter: Line['filter'], color?: string) {
    const key = `${parent.key}-${id}`
    const current = parent.children.find((line) => line.key === key)
    if (current) return current
    const line = { ...blankLine(key, id, label, true), depth: parent.depth + 1, filter, color }
    parent.children.push(line)
    return line
  }
  function activityChild(parent: Line, id: string, label: string) {
    return child(parent, activityGroupKey(id, label), label, 'activity')
  }
  function projectLine(id: string, label: string) {
    const current = projects.get(id)
    if (current) return current
    const line = { ...blankLine(id, id, label, true), filter: 'project' as const, color: projectColor(id) }
    projects.set(id, line)
    return line
  }
  for (const bucket of report.projects) {
    const line = projectLine(bucket.id, bucket.label)
    line.seconds = bucket.seconds
  }
  for (const share of report.shares) {
    const project = projectLine(share.projectId, projectNames.get(share.projectId) ?? 'Unknown project')
    addMoney(project.money, share.currency, share.amount)
    const parent = withClients ? child(project, share.clientId, clientName(share.clientId), 'client') : project
    if (withClients) {
      parent.seconds += share.seconds
      addMoney(parent.money, share.currency, share.amount)
    }
    if (withActivity) {
      const activity = activityChild(parent, share.activityId, share.activity)
      activity.seconds += share.seconds
      addMoney(activity.money, share.currency, share.amount)
    }
  }
  function count(item: ReportItem, kind: 'request' | 'task') {
    const project = projectLine(item.projectId, item.project)
    const bump = (line: Line) => {
      if (kind === 'request') line.requests += 1
      else {
        line.tasks += 1
        if (item.done) line.completed += 1
      }
    }
    bump(project)
    if (withClients) {
      for (const clientId of item.clientIds) {
        const client = child(project, clientId, clientName(clientId), 'client')
        bump(client)
        if (withActivity) bump(activityChild(client, item.activityId, item.activity))
      }
    } else if (withActivity) {
      bump(activityChild(project, item.activityId, item.activity))
    }
  }
  for (const item of report.requestItems) count(item, 'request')
  for (const item of report.taskItems) count(item, 'task')
  function hours(row: WorkRow, kind: 'request' | 'task') {
    const ids = row.clientIds.length > 0 ? row.clientIds : [NO_CLIENT]
    const project = projectLine(row.projectId, row.project)
    if (kind === 'request') project.requestSeconds += row.seconds
    else project.taskSeconds += row.seconds
    if (withClients) {
      const share = row.seconds / ids.length
      for (const clientId of ids) {
        const client = child(project, clientId, clientName(clientId), 'client')
        if (kind === 'request') client.requestSeconds += share
        else client.taskSeconds += share
        if (withActivity) {
          const activity = activityChild(client, row.activityId, row.activity)
          if (kind === 'request') activity.requestSeconds += share
          else activity.taskSeconds += share
        }
      }
    } else if (withActivity) {
      const activity = activityChild(project, row.activityId, row.activity)
      if (kind === 'request') activity.requestSeconds += row.seconds
      else activity.taskSeconds += row.seconds
    }
  }
  for (const row of report.requestTime) hours(row, 'request')
  for (const row of report.taskTime) hours(row, 'task')
  function finish(lines: Line[]): Line[] {
    return lines
      .map((line) => ({ ...line, children: finish(line.children).sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label)) }))
      .filter(hasFigures)
  }
  return finish([...projects.values()]).sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label))
}

function flatLines(
  report: {
    projects: Bucket[]
    activities: Bucket[]
    clientSplits: ClientSplit[]
    shares: Share[]
    requestTime: WorkRow[]
    taskTime: WorkRow[]
    requestItems: ReportItem[]
    taskItems: ReportItem[]
  },
  groupBy: 'project' | 'client' | 'requester' | 'activity',
  clientName: (id: string) => string,
) {
  const billing = groupBy !== 'requester'
  const lines = new Map<string, Line>()
  function lineFor(id: string, label: string) {
    const current = lines.get(id)
    if (current) return current
    const filter: Line['filter'] = groupBy === 'project' ? 'project' : groupBy === 'client' ? 'client' : groupBy === 'activity' ? 'activity' : null
    const line = { ...blankLine(id, id, label, billing), filter }
    lines.set(id, line)
    return line
  }
  if (groupBy === 'project') {
    const amounts = moneyBy(report.shares, (share) => share.projectId)
    for (const bucket of report.projects) {
      const line = lineFor(bucket.id, bucket.label)
      line.seconds = bucket.seconds
      line.money = amounts.get(bucket.id) ?? {}
    }
  } else if (groupBy === 'activity') {
    const amounts = moneyBy(report.shares, (share) => activityGroupKey(share.activityId, share.activity))
    const seconds = new Map<string, { label: string; seconds: number }>()
    for (const share of report.shares) {
      const key = activityGroupKey(share.activityId, share.activity)
      const current = seconds.get(key)
      if (current) current.seconds += share.seconds
      else seconds.set(key, { label: share.activity, seconds: share.seconds })
    }
    for (const [key, bucket] of seconds) {
      const line = lineFor(key, bucket.label)
      line.seconds = bucket.seconds
      line.money = amounts.get(key) ?? {}
    }
  } else if (groupBy === 'client') {
    for (const client of report.clientSplits) {
      const line = lineFor(client.id, client.name)
      line.seconds = client.seconds
      line.money = { ...client.money }
    }
  }
  function place(item: ReportItem) {
    if (groupBy === 'client') return item.clientIds.map((id) => ({ id, label: clientName(id) }))
    if (groupBy === 'activity') return [{ id: activityGroupKey(item.activityId, item.activity), label: item.activity }]
    if (groupBy === 'requester') return [{ id: item.requesterId, label: item.requester }]
    return [{ id: item.projectId, label: item.project }]
  }
  for (const item of report.requestItems) {
    for (const slice of place(item)) lineFor(slice.id, slice.label).requests += 1
  }
  for (const item of report.taskItems) {
    for (const slice of place(item)) {
      const line = lineFor(slice.id, slice.label)
      line.tasks += 1
      if (item.done) line.completed += 1
    }
  }
  function placeHours(row: WorkRow) {
    if (groupBy === 'client') {
      const ids = row.clientIds.length > 0 ? row.clientIds : [NO_CLIENT]
      return ids.map((id) => ({ id, label: clientName(id), seconds: row.seconds / ids.length }))
    }
    if (groupBy === 'activity') return [{ id: activityGroupKey(row.activityId, row.activity), label: row.activity, seconds: row.seconds }]
    if (groupBy === 'requester') return [{ id: row.requesterId, label: row.requester, seconds: row.seconds }]
    return [{ id: row.projectId, label: row.project, seconds: row.seconds }]
  }
  for (const row of report.requestTime) {
    for (const slice of placeHours(row)) lineFor(slice.id, slice.label).requestSeconds += slice.seconds
  }
  for (const row of report.taskTime) {
    for (const slice of placeHours(row)) lineFor(slice.id, slice.label).taskSeconds += slice.seconds
  }
  return [...lines.values()].filter(hasFigures).sort((a, b) => {
    const aRank = a.billing ? a.seconds : a.requestSeconds + a.taskSeconds
    const bRank = b.billing ? b.seconds : b.requestSeconds + b.taskSeconds
    return bRank - aRank || a.label.localeCompare(b.label)
  })
}

function ReportSkeleton() {
  return (
    <div className="min-h-[18rem] flex-1 overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client / project</TableHead>
            <TableHead>Total share</TableHead>
            <TableHead className="text-right">Total hours</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Requests</TableHead>
            <TableHead className="text-right">Request hours</TableHead>
            <TableHead className="text-right">Tasks</TableHead>
            <TableHead className="text-right">Completed</TableHead>
            <TableHead className="text-right">Task hours</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }, (_, index) => (
            <TableRow key={index}>
              <TableCell>
                <Skeleton className="h-4 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-1.5 w-24" />
              </TableCell>
              {Array.from({ length: 7 }, (_, cell) => (
                <TableCell key={cell}>
                  <Skeleton className="ml-auto h-4 w-12" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

