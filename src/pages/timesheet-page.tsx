import { useQuery } from '@tanstack/react-query'
import { endOfMonth, format, startOfMonth } from 'date-fns'
import { Fragment, useMemo, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCatalog } from '@/features/projects/use-catalog'
import { useWorkspace } from '@/features/workspaces/workspace-context'
import { qk } from '@/lib/query-keys'
import { allocateSeconds, formatHours } from '@/lib/splits'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { SupportRequest, TimeEntry } from '@/types'

const ALL = 'all'
const NO_CLIENT = '__none__'
const NO_PROJECT = '__none_project__'
const NO_ACTIVITY = '__none_activity__'
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

function taskLabel(req: SupportRequest) {
  return `#${String(req.task_number).padStart(4, '0')} ${req.requester}: ${req.request}`
}

export function TimesheetPage() {
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
        .select('*, project:projects(*), activity:activities(*), time_entry_clients(client_id)')
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
        .select('*, project:projects(*)')
        .gte('logged_on', from)
        .lte('logged_on', to)
      if (!isAll) q = q.eq('workspace_id', workspaceId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as SupportRequest[]
    },
  })

  const report = useMemo(() => {
    const included: TimeEntry[] = []
    const shares: Share[] = []

    for (const entry of entries.data ?? []) {
      if (projectId && entry.project_id !== projectId) continue
      if (activityId && entry.activity_id !== activityId) continue
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
          'Unknown project'
        )
      }
      if (id === NO_ACTIVITY) return 'No activity'
      return (
        catalog.activities.find((activity) => activity.id === id)?.name ??
        included.find((entry) => entry.activity_id === id)?.activity?.name ??
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

    const tasks = (requests.data ?? []).filter((req) => {
      if (projectId && req.project_id !== projectId) return false
      if (!clientId) return true
      return catalog.projectClients.some((pc) => pc.project_id === req.project_id && pc.client_id === clientId)
    })

    function requestClients(req: SupportRequest) {
      const ids = catalog.projectClients.filter((pc) => pc.project_id === req.project_id).map((pc) => pc.client_id)
      const visible = clientId ? ids.filter((id) => id === clientId) : ids
      if (visible.length === 0) return [{ id: NO_CLIENT, name: 'No client' }]
      return visible.map((id) => ({ id, name: nameFor(id, 'client') }))
    }

    const byProject = new Map<string, SupportRequest[]>()
    const byClient = new Map<string, { name: string; requests: SupportRequest[] }>()
    const byClientProject = new Map<string, { name: string; requests: SupportRequest[] }>()
    for (const req of tasks) {
      const projectName = req.project?.name ?? nameFor(req.project_id, 'project')
      const projectRows = byProject.get(req.project_id) ?? []
      projectRows.push(req)
      byProject.set(req.project_id, projectRows)
      for (const client of requestClients(req)) {
        const clientGroup = byClient.get(client.id) ?? { name: client.name, requests: [] }
        clientGroup.requests.push(req)
        byClient.set(client.id, clientGroup)
        const key = `${client.id}:${req.project_id}`
        const both = byClientProject.get(key) ?? { name: `${client.name} · ${projectName}`, requests: [] }
        both.requests.push(req)
        byClientProject.set(key, both)
      }
    }

    function groups(map: Map<string, { name: string; requests: SupportRequest[] } | SupportRequest[]>, named: boolean) {
      const rows = [...map.entries()].map(([id, value]) => {
        if (named) {
          const group = value as { name: string; requests: SupportRequest[] }
          return { id, name: group.name, requests: group.requests }
        }
        const list = value as SupportRequest[]
        return { id, name: list[0]?.project?.name ?? nameFor(id, 'project'), requests: list }
      })
      return rows.sort((a, b) => a.name.localeCompare(b.name))
    }

    return {
      totalSeconds,
      billableSeconds,
      money,
      taskCount: tasks.length,
      projects: buckets('project'),
      clients: buckets('client'),
      activities: buckets('activity'),
      clientSplits,
      shares,
      taskGroups: {
        project: groups(byProject, false),
        client: groups(byClient, true),
        both: groups(byClientProject, true),
      },
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
  ])

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
    a.download = `timesheet-${from}-to-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <h1 className="sr-only">Timesheet</h1>
      <div className="flex flex-wrap items-end justify-end gap-3 print:hidden">
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={report.clientSplits.length === 0 && report.taskCount === 0}>
            Export CSV
          </Button>
          <Button onClick={() => window.print()}>Print report</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
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
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Total hours" value={formatHours(report.totalSeconds)} />
        <Summary label="Billable hours" value={formatHours(report.billableSeconds)} />
        <Summary label="Amount" value={formatMoney(report.money)} />
        <Summary label="Tasks" value={String(report.taskCount)} />
      </div>

      <div className="grid gap-4 print:hidden lg:grid-cols-3">
        <Donut title="Hours by project" slices={report.projects} />
        <Donut title="Hours by client" slices={report.clients} />
        <Donut title="Hours by activity" slices={report.activities} />
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium">Clients and projects</h2>
        {report.clientSplits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No time in this range.</p>
        ) : (
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

      <section>
        <h2 className="mb-2 text-sm font-medium">Tasks</h2>
        <Tabs defaultValue="project" className="print:hidden">
          <TabsList>
            <TabsTrigger value="project">By project</TabsTrigger>
            <TabsTrigger value="client">By client</TabsTrigger>
            <TabsTrigger value="both">By client and project</TabsTrigger>
          </TabsList>
          <TaskGroups value="project" groups={report.taskGroups.project} />
          <TaskGroups value="client" groups={report.taskGroups.client} />
          <TaskGroups value="both" groups={report.taskGroups.both} />
        </Tabs>
        <div className="hidden space-y-6 print:block">
          <PrintedTasks title="By project" groups={report.taskGroups.project} />
          <PrintedTasks title="By client" groups={report.taskGroups.client} />
          <PrintedTasks title="By client and project" groups={report.taskGroups.both} />
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
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function pointOnCircle(cx: number, cy: number, radius: number, angle: number) {
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)] as const
}

function donutSlicePath(cx: number, cy: number, outer: number, inner: number, start: number, end: number) {
  const sweep = end - start
  if (sweep >= Math.PI * 2 - 1e-4) {
    return [
      `M ${cx} ${cy - outer}`,
      `A ${outer} ${outer} 0 1 1 ${cx - 0.01} ${cy - outer}`,
      `A ${outer} ${outer} 0 1 1 ${cx} ${cy - outer}`,
      `M ${cx} ${cy - inner}`,
      `A ${inner} ${inner} 0 1 0 ${cx - 0.01} ${cy - inner}`,
      `A ${inner} ${inner} 0 1 0 ${cx} ${cy - inner}`,
      'Z',
    ].join(' ')
  }
  const large = sweep > Math.PI ? 1 : 0
  const [x1, y1] = pointOnCircle(cx, cy, outer, start)
  const [x2, y2] = pointOnCircle(cx, cy, outer, end)
  const [x3, y3] = pointOnCircle(cx, cy, inner, end)
  const [x4, y4] = pointOnCircle(cx, cy, inner, start)
  return `M ${x1} ${y1} A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`
}

function Donut({ title, slices }: { title: string; slices: Bucket[] }) {
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
        <p className="text-sm text-muted-foreground">No hours.</p>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative size-28 shrink-0">
            <svg viewBox="0 0 100 100" className="size-full" role="img" aria-label={title}>
              {arcs.map((slice) => (
                <path
                  key={slice.id}
                  d={donutSlicePath(50, 50, 46, 28, slice.start, slice.end)}
                  fill={slice.color}
                  fillRule="evenodd"
                  className="transition-opacity duration-150"
                  opacity={hoveredId && hoveredId !== slice.id ? 0.3 : 1}
                  onMouseEnter={() => setHoveredId(slice.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <title>
                    {slice.label}: {formatHours(slice.seconds)} ({Math.round(slice.share * 100)}%)
                  </title>
                </path>
              ))}
            </svg>
            {hovered ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-3 text-center">
                <p className="text-[10px] leading-tight">
                  <span className="block truncate font-medium">{hovered.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatHours(hovered.seconds)} · {Math.round(hovered.share * 100)}%
                  </span>
                </p>
              </div>
            ) : null}
          </div>
          <ul className="min-w-0 flex-1 space-y-0.5">
            {arcs.map((slice) => (
              <li key={slice.id}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left text-xs hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
                    hoveredId === slice.id && 'bg-muted',
                    hoveredId && hoveredId !== slice.id && 'opacity-50',
                  )}
                  onMouseEnter={() => setHoveredId(slice.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(slice.id)}
                  onBlur={() => setHoveredId(null)}
                >
                  <span className="size-2 shrink-0 rounded-sm" style={{ background: slice.color }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{slice.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatHours(slice.seconds)} ({Math.round(slice.share * 100)}%)
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

function PrintedTasks({
  title,
  groups,
}: {
  title: string
  groups: { id: string; name: string; requests: SupportRequest[] }[]
}) {
  if (groups.length === 0) return null
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <TaskList groups={groups} />
    </div>
  )
}

function TaskList({ groups }: { groups: { id: string; name: string; requests: SupportRequest[] }[] }) {
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.id}>
          <p className="text-sm font-medium">
            {group.name} <span className="text-muted-foreground">{group.requests.length}</span>
          </p>
          <ul className="mt-1 space-y-1 text-sm">
            {group.requests.map((req) => (
              <li key={req.id}>{taskLabel(req)}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function TaskGroups({
  value,
  groups,
}: {
  value: string
  groups: { id: string; name: string; requests: SupportRequest[] }[]
}) {
  return (
    <TabsContent value={value}>
      {groups.length === 0 ? <p className="text-sm text-muted-foreground">No tasks in this range.</p> : <TaskList groups={groups} />}
    </TabsContent>
  )
}
