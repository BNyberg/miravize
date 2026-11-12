import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useCatalog } from '@/features/projects/use-catalog'
import { ALL_WORKSPACES, useWorkspace } from '@/features/workspaces/workspace-context'
import { normalizeProjectName, parseRequestNote } from '@/lib/aliases'
import { qk } from '@/lib/query-keys'
import { supabase } from '@/lib/supabase'
import type { SupportRequest } from '@/types'

type Logged = {
  task_number: number
  requester: string
  project: string
  request: string
}

export function RequestsPage() {
  const { workspaceId, isAll, workspaces } = useWorkspace()
  const catalog = useCatalog()
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [pickedWorkspace, setPickedWorkspace] = useState('')
  const [fallback, setFallback] = useState<{ requester: string; request: string; project: string; website: string; additionalNotes: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logged, setLogged] = useState<Logged | null>(null)

  const list = useQuery({
    queryKey: qk.requests(workspaceId),
    queryFn: async () => {
      let q = supabase.from('requests').select('*, project:projects(*)').order('task_number', { ascending: false }).limit(50)
      if (!isAll) q = q.eq('workspace_id', workspaceId)
      const { data, error: err } = await q
      if (err) throw err
      return (data ?? []) as SupportRequest[]
    },
  })

  const activeWorkspace = isAll ? pickedWorkspace : workspaceId

  const extract = useMutation({
    mutationFn: async () => {
      if (!activeWorkspace || activeWorkspace === ALL_WORKSPACES) throw new Error('Pick a workspace.')
      if (!file) throw new Error('Attach a screenshot.')
      const submissionId = crypto.randomUUID()
      const path = `${activeWorkspace}/${submissionId}`
      const { error: upErr } = await supabase.storage.from('request-screenshots').upload(path, file, { upsert: false })
      if (upErr) throw upErr
      const { data, error: fnErr } = await supabase.functions.invoke('extract-request', {
        body: {
          workspace_id: activeWorkspace,
          screenshot_path: path,
          note,
          submission_id: submissionId,
        },
      })
      if (fnErr) throw fnErr
      if (data?.error) {
        setFallback({
          requester: data.requester ?? '',
          request: data.request ?? '',
          project: data.project ?? parseRequestNote(note).project,
          website: data.website ?? parseRequestNote(note).website,
          additionalNotes: data.additional_notes ?? parseRequestNote(note).additionalNotes,
        })
        throw new Error(data.error)
      }
      return data as Logged
    },
    onSuccess: (data) => {
      setLogged(data)
      setError(null)
      void qc.invalidateQueries({ queryKey: ['requests'] })
    },
    onError: (err: Error) => setError(err.message),
  })

  const manual = useMutation({
    mutationFn: async () => {
      if (!activeWorkspace || !fallback) throw new Error('Nothing to save.')
      const aliases = catalog.aliases.map((a) => ({
        shortcut: a.shortcut,
        officialName: catalog.allProjects.find((p) => p.id === a.project_id)?.name ?? a.shortcut,
      }))
      const official = normalizeProjectName(fallback.project, aliases)
      const project = catalog.projects.find((p) => p.name.toLowerCase() === official.toLowerCase())
        ?? catalog.allProjects.find((p) => p.name.toLowerCase() === official.toLowerCase())
      if (!project) throw new Error(`Unknown project "${official}".`)
      const { data, error: err } = await supabase.rpc('log_support_request', {
        p_workspace_id: activeWorkspace,
        p_submission_id: crypto.randomUUID(),
        p_requester: fallback.requester,
        p_request: fallback.request,
        p_project_id: project.id,
        p_website: fallback.website,
        p_additional_notes: fallback.additionalNotes,
      })
      if (err) throw err
      return {
        task_number: data.task_number as number,
        requester: data.requester as string,
        project: project.name,
        request: data.request as string,
      }
    },
    onSuccess: (data) => {
      setLogged(data)
      setFallback(null)
      setError(null)
      void qc.invalidateQueries({ queryKey: ['requests'] })
    },
    onError: (err: Error) => setError(err.message),
  })

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Requests</h1>
        <p className="text-sm text-muted-foreground">Screenshot + note, in the order Project | Website | Additional Notes.</p>
      </div>
      {error ? (
        <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
          {error}
        </div>
      ) : null}
      {logged ? (
        <Card>
          <CardContent className="space-y-1 pt-4 text-sm">
            <p className="font-semibold">Logged #{String(logged.task_number).padStart(4, '0')}</p>
            <p>Requester: {logged.requester}</p>
            <p>Project: {logged.project}</p>
            <p>Request: {logged.request}</p>
          </CardContent>
        </Card>
      ) : null}
      {isAll ? (
        <div className="grid max-w-sm gap-1.5">
          <Label htmlFor="rws">Workspace</Label>
          <select
            id="rws"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={pickedWorkspace}
            onChange={(e) => setPickedWorkspace(e.target.value)}
          >
            <option value="">Select workspace</option>
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Log a request</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="shot">Screenshot</Label>
            <Input id="shot" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="note">Note</Label>
            <Textarea id="note" placeholder="TD | example.com | optional context" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button onClick={() => extract.mutate()} disabled={extract.isPending}>
            Extract and log
          </Button>
          {fallback ? (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-sm font-medium">Manual fallback</p>
              <Input value={fallback.requester} onChange={(e) => setFallback({ ...fallback, requester: e.target.value })} placeholder="Requester" />
              <Textarea value={fallback.request} onChange={(e) => setFallback({ ...fallback, request: e.target.value })} placeholder="Request" />
              <Input value={fallback.project} onChange={(e) => setFallback({ ...fallback, project: e.target.value })} placeholder="Project" />
              <Input value={fallback.website} onChange={(e) => setFallback({ ...fallback, website: e.target.value })} placeholder="Website" />
              <Textarea value={fallback.additionalNotes} onChange={(e) => setFallback({ ...fallback, additionalNotes: e.target.value })} placeholder="Additional notes" />
              <Button variant="outline" onClick={() => manual.mutate()} disabled={manual.isPending}>
                Save manually
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Logged requests</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                {isAll ? <TableHead>Workspace</TableHead> : null}
                <TableHead>Date</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Request</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="tabular">#{String(row.task_number).padStart(4, '0')}</TableCell>
                  {isAll ? <TableCell>{workspaces.find((w) => w.id === row.workspace_id)?.name}</TableCell> : null}
                  <TableCell>{row.logged_on}</TableCell>
                  <TableCell>{row.requester}</TableCell>
                  <TableCell>{row.project?.name}</TableCell>
                  <TableCell>{row.request}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
