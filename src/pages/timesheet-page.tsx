import { useQuery } from '@tanstack/react-query'
import { endOfWeek, format, startOfWeek } from 'date-fns'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useCatalog } from '@/features/projects/use-catalog'
import { useWorkspace } from '@/features/workspaces/workspace-context'
import { qk } from '@/lib/query-keys'
import { allocateSeconds, formatHours } from '@/lib/splits'
import { supabase } from '@/lib/supabase'
import type { SupportRequest, TimeEntry } from '@/types'

const NO_CLIENT = '__none__'

type Row = {
  clientId: string
  clientName: string
  billable: number
  total: number
  entries: { description: string; project: string; seconds: number; billable: boolean }[]
  requests: SupportRequest[]
}

function ensureRow(map: Map<string, Row>, clientId: string, clientName: string) {
  const current = map.get(clientId)
  if (current) return current
  const created: Row = { clientId, clientName, billable: 0, total: 0, entries: [], requests: [] }
  map.set(clientId, created)
  return created
}

export function TimesheetPage() {
  const { workspaceId, isAll, workspaces } = useWorkspace()
  const catalog = useCatalog()
  const [from, setFrom] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'))
  const [clientId, setClientId] = useState('')
  const [printMode, setPrintMode] = useState(false)

  const entries = useQuery({
    queryKey: qk.entries(workspaceId, `${from}-${to}`),
    queryFn: async () => {
      let q = supabase
        .from('time_entries')
        .select('*, project:projects(*)')
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

  const rows = useMemo(() => {
    const map = new Map<string, Row>()
    function pushEntry(row: Row, entry: TimeEntry, seconds: number) {
      row.total += seconds
      if (entry.billable) row.billable += seconds
      row.entries.push({
        description: entry.description || entry.project?.name || 'Time',
        project: entry.project?.name ?? '',
        seconds,
        billable: entry.billable,
      })
    }

    for (const entry of entries.data ?? []) {
      const splits = catalog.projectClients
        .filter((pc) => pc.project_id === entry.project_id)
        .map((pc) => ({ clientId: pc.client_id, percent: Number(pc.split_percent) }))
      if (splits.length === 0) {
        if (clientId) continue
        const row = ensureRow(map, NO_CLIENT, 'No client')
        pushEntry(row, entry, entry.duration_seconds ?? 0)
        continue
      }
      const allocated = allocateSeconds(entry.duration_seconds ?? 0, splits)
      for (const share of allocated) {
        if (clientId && share.clientId !== clientId) continue
        const client = catalog.clients.find((c) => c.id === share.clientId)
        const row = ensureRow(map, share.clientId, client?.name ?? 'Unknown client')
        pushEntry(row, entry, share.seconds)
      }
    }
    for (const req of requests.data ?? []) {
      const clientIds = catalog.projectClients.filter((pc) => pc.project_id === req.project_id).map((pc) => pc.client_id)
      if (clientIds.length === 0) {
        if (clientId) continue
        ensureRow(map, NO_CLIENT, 'No client').requests.push(req)
        continue
      }
      for (const id of clientIds) {
        if (clientId && id !== clientId) continue
        const current = map.get(id)
        if (!current) continue
        current.requests.push(req)
      }
    }
    return [...map.values()].sort((a, b) => a.clientName.localeCompare(b.clientName))
  }, [catalog.clients, catalog.projectClients, clientId, entries.data, requests.data])

  function exportCsv() {
    const header = ['Client', 'Billable hours', 'Total hours']
    const lines = [header.join(','), ...rows.map((r) => [r.clientName, formatHours(r.billable), formatHours(r.total)].join(','))]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `timesheet-${from}-to-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={`mx-auto flex max-w-5xl flex-col gap-4 ${printMode ? 'print:max-w-none' : ''}`}>
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold">Timesheet</h1>
          <p className="text-sm text-muted-foreground">Billable vs total hours per client, allocated by project split.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            Export CSV
          </Button>
          <Button
            onClick={() => {
              setPrintMode(true)
              window.setTimeout(() => {
                window.print()
                setPrintMode(false)
              }, 50)
            }}
          >
            Print report
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <div className="grid gap-1.5">
          <Label htmlFor="from">From</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="to">To</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="client">Client</Label>
          <select
            id="client"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">All clients</option>
            {catalog.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            {from} → {to}
            {isAll ? ' · All workspaces' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Billable hours</TableHead>
                <TableHead>Total hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.clientId}>
                  <TableCell>{row.clientName}</TableCell>
                  <TableCell className="tabular">{formatHours(row.billable)}</TableCell>
                  <TableCell className="tabular">{formatHours(row.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No time in this range.</p> : null}
        </CardContent>
      </Card>
      {printMode || true ? (
        <div className="space-y-6">
          {rows.map((row) => (
            <Card key={`report-${row.clientId}`}>
              <CardHeader>
                <CardTitle>{row.clientName}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  Billable {formatHours(row.billable)}h · Total {formatHours(row.total)}h
                </p>
                <ul className="list-disc pl-5">
                  {row.entries.map((entry, i) => (
                    <li key={`${row.clientId}-${i}`}>
                      {entry.project}: {entry.description} ({formatHours(entry.seconds)}h
                      {entry.billable ? '' : ', non-billable'})
                    </li>
                  ))}
                </ul>
                {row.requests.length > 0 ? (
                  <div>
                    <p className="font-medium">Support requests</p>
                    <ul className="list-disc pl-5">
                      {row.requests.map((req) => (
                        <li key={req.id}>
                          #{String(req.task_number).padStart(4, '0')} {req.requester}: {req.request}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
      {isAll ? (
        <p className="text-xs text-muted-foreground print:hidden">
          Showing memberships across {workspaces.length} workspaces.
        </p>
      ) : null}
    </div>
  )
}
