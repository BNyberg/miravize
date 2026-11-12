import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { useCatalog } from '@/features/projects/use-catalog'
import { ALL_WORKSPACES, useWorkspace } from '@/features/workspaces/workspace-context'
import { qk } from '@/lib/query-keys'
import { splitsTotal, type SplitShare } from '@/lib/splits'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { Client, Project } from '@/types'

const PRESETS: { label: string; parts: number[] }[] = [
  { label: '50/50', parts: [50, 50] },
  { label: '60/40', parts: [60, 40] },
  { label: '70/30', parts: [70, 30] },
]

const SWATCHES = [
  '#1F7A4D',
  '#0F6B5C',
  '#1F5E7A',
  '#2F4A8A',
  '#5E3A8A',
  '#8A3A5E',
  '#B42318',
  '#9A4A12',
  '#7A6B1F',
  '#3D5A3A',
  '#5E5C57',
  '#1C1B19',
]

const DEFAULT_COLOR = '#1F7A4D'
const CURRENCIES = ['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK'] as const

type Section = 'projects' | 'clients' | 'tags' | 'aliases'

export function ProjectsPage() {
  const { workspaceId, isAll, canManage } = useWorkspace()
  const catalog = useCatalog()
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [section, setSection] = useState<Section>('projects')
  const [draftKey, setDraftKey] = useState(0)
  const [clientKey, setClientKey] = useState(0)

  function needWorkspace() {
    if (isAll || workspaceId === ALL_WORKSPACES) {
      setError('Switch to a specific workspace to create records.')
      return false
    }
    return true
  }

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.clients(workspaceId) }),
      qc.invalidateQueries({ queryKey: qk.projects(workspaceId) }),
      qc.invalidateQueries({ queryKey: qk.tags(workspaceId) }),
      qc.invalidateQueries({ queryKey: qk.aliases(workspaceId) }),
      qc.invalidateQueries({ queryKey: qk.projectClients(workspaceId) }),
      qc.invalidateQueries({ queryKey: qk.projectTags(workspaceId) }),
      qc.invalidateQueries({ queryKey: qk.activities(workspaceId) }),
    ])
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto lg:overflow-hidden">
      <h1 className="sr-only">Projects</h1>
      {error ? (
        <div role="alert" className="border border-destructive/40 px-3 py-2 text-sm">
          {error}
        </div>
      ) : null}
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex h-9 overflow-hidden rounded-md border border-border">
          {(
            [
              ['projects', 'Projects'],
              ['clients', 'Clients'],
              ['tags', 'Tags'],
              ['aliases', 'Aliases'],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              aria-pressed={section === value}
              className={cn(
                'h-full px-3 text-sm',
                section === value ? 'bg-foreground text-background' : 'text-muted-foreground',
              )}
              onClick={() => setSection(value)}
            >
              {text}
            </button>
          ))}
        </div>
        {canManage && section === 'projects' ? (
          <Button variant="outline" className="ml-auto" onClick={() => setDraftKey((n) => n + 1)}>
            New project
          </Button>
        ) : null}
        {canManage && section === 'clients' ? (
          <Button variant="outline" className="ml-auto" onClick={() => setClientKey((n) => n + 1)}>
            New client
          </Button>
        ) : null}
      </div>
      {section === 'projects' ? (
        <ProjectEditor
          key={draftKey}
          canManage={canManage}
          catalog={catalog}
          needWorkspace={needWorkspace}
          onError={setError}
          onSaved={() => void refresh()}
          workspaceId={workspaceId}
        />
      ) : null}
      {section === 'clients' ? (
        <ClientEditor
          key={clientKey}
          canManage={canManage}
          catalog={catalog}
          needWorkspace={needWorkspace}
          onError={setError}
          onSaved={() => void refresh()}
          workspaceId={workspaceId}
        />
      ) : null}
      {section === 'tags' ? (
        <NameList
          canManage={canManage}
          label="Tag name"
          items={catalog.tags.map((tag) => tag.name)}
          onCreate={async (name) => {
            if (!needWorkspace()) return
            const { error: err } = await supabase.from('tags').insert({ workspace_id: workspaceId, name })
            if (err) throw err
            await refresh()
          }}
        />
      ) : null}
      {section === 'aliases' ? (
        <AliasEditor
          canManage={canManage}
          catalog={catalog}
          needWorkspace={needWorkspace}
          workspaceId={workspaceId}
          onSaved={() => void refresh()}
        />
      ) : null}
    </div>
  )
}

function ClientEditor({
  catalog,
  canManage,
  needWorkspace,
  workspaceId,
  onError,
  onSaved,
}: {
  catalog: ReturnType<typeof useCatalog>
  canManage: boolean
  needWorkspace: () => boolean
  workspaceId: string
  onError: (msg: string | null) => void
  onSaved: () => void
}) {
  const [editing, setEditing] = useState<Client | null>(null)
  const [name, setName] = useState('')
  const [billable, setBillable] = useState(true)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [activityName, setActivityName] = useState('')
  const [activityProjectId, setActivityProjectId] = useState('')
  const qc = useQueryClient()

  function load(client?: Client) {
    setEditing(client ?? null)
    setName(client?.name ?? '')
    setBillable(client?.default_billable ?? true)
    setActivityName('')
    if (client) {
      const next: Record<string, string> = {}
      for (const row of catalog.projectClients.filter((item) => item.client_id === client.id)) {
        next[row.project_id] = row.hourly_rate != null ? String(row.hourly_rate) : ''
      }
      setOverrides(next)
      const first = catalog.projectClients.find((item) => item.client_id === client.id)
      setActivityProjectId(first?.project_id ?? '')
    } else {
      setOverrides({})
      setActivityProjectId('')
    }
  }

  const links = editing ? catalog.projectClients.filter((row) => row.client_id === editing.id) : []
  const clientActivities = editing ? catalog.activities.filter((row) => row.client_id === editing.id) : []

  async function save() {
    if (!needWorkspace() || !name.trim()) {
      onError('Client needs a name.')
      return
    }
    onError(null)
    try {
      let saved: Client
      if (editing) {
        const { data, error } = await supabase
          .from('clients')
          .update({ name: name.trim(), default_billable: billable })
          .eq('id', editing.id)
          .select('*')
          .single()
        if (error) throw error
        saved = data as Client
      } else {
        const { data, error } = await supabase
          .from('clients')
          .insert({ workspace_id: workspaceId, name: name.trim(), default_billable: billable })
          .select('*')
          .single()
        if (error) throw error
        saved = data as Client
      }
      qc.setQueryData(qk.clients(workspaceId), (current: Client[] | undefined) => {
        const list = current ?? []
        const index = list.findIndex((item) => item.id === saved.id)
        if (index >= 0) {
          const next = [...list]
          next[index] = saved
          return next
        }
        return [...list, saved]
      })
      load(saved)
      toast({ tone: 'success', title: 'Client saved', description: saved.name })
      for (const row of catalog.projectClients.filter((item) => item.client_id === saved.id)) {
        const raw = overrides[row.project_id] ?? ''
        const { error } = await supabase.rpc('set_project_client_rate', {
          p_project_id: row.project_id,
          p_client_id: saved.id,
          p_hourly_rate: raw.trim() === '' ? null : Number(raw),
        })
        if (error) throw error
      }
      onSaved()
    } catch (err) {
      toast({ tone: 'error', title: 'Could not save client', description: err instanceof Error ? err.message : 'Try again.' })
    }
  }

  async function addActivity() {
    if (!needWorkspace() || !editing || !activityName.trim() || !activityProjectId) return
    const { error } = await supabase.from('activities').insert({
      workspace_id: workspaceId,
      project_id: activityProjectId,
      client_id: editing.id,
      name: activityName.trim(),
    })
    if (error) throw error
    setActivityName('')
    onSaved()
  }

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <ul className="h-full min-h-0 overflow-y-auto rounded-lg border border-border">
        {catalog.clients.length === 0 ? (
          <li className="px-3 py-3 text-sm text-muted-foreground">No clients yet. Use New client.</li>
        ) : (
          catalog.clients.map((client) => {
            const count = catalog.projectClients.filter((row) => row.client_id === client.id).length
            return (
              <li key={client.id} className="border-t border-border first:border-t-0">
                <button
                  type="button"
                  className={cn('block w-full px-3 py-2.5 text-left', editing?.id === client.id && 'bg-muted')}
                  onClick={() => load(client)}
                >
                  <p className="truncate text-sm font-medium">{client.name}</p>
                  {count > 0 ? (
                    <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {count} {count === 1 ? 'project' : 'projects'}
                    </p>
                  ) : null}
                </button>
              </li>
            )
          })
        )}
      </ul>
      <div className="h-full min-h-0 overflow-y-auto rounded-lg border border-border bg-card p-4">
        <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground">
          {editing ? 'CLIENT' : 'NEW CLIENT'}
        </p>
        {!canManage ? <p className="mt-2 text-sm text-muted-foreground">View only.</p> : null}
        <div className="mt-4 grid gap-1.5">
          <Label htmlFor="cname">Name</Label>
          <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Switch checked={billable} onCheckedChange={setBillable} disabled={!canManage} id="cbill" />
          <Label htmlFor="cbill">Billable by default</Label>
        </div>
        {editing ? (
          <>
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium">Projects</p>
              {links.length === 0 ? (
                <p className="text-sm text-muted-foreground">Link this client from a project.</p>
              ) : (
                links.map((link) => {
                  const project = catalog.allProjects.find((item) => item.id === link.project_id)
                  const currency = project?.currency ?? 'SEK'
                  return (
                    <div key={link.id} className="mb-2 flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-sm" style={{ background: project?.color || '#5E5C57' }} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-sm">{project?.name}</span>
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{Number(link.split_percent)}%</span>
                      <Input
                        className="w-24"
                        type="number"
                        min={0}
                        step={0.01}
                        disabled={!canManage}
                        value={overrides[link.project_id] ?? ''}
                        placeholder={project?.hourly_rate != null ? String(project.hourly_rate) : 'Default'}
                        onChange={(e) => setOverrides((current) => ({ ...current, [link.project_id]: e.target.value }))}
                      />
                      <span className="w-8 text-sm text-muted-foreground">{currency}</span>
                    </div>
                  )
                })
              )}
            </div>
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium">Activities</p>
              {canManage && links.length > 0 ? (
                <form
                  className="mb-2 flex h-9 items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void addActivity()
                  }}
                >
                  <Select value={activityProjectId || undefined} onValueChange={setActivityProjectId}>
                    <SelectTrigger className="w-2/5">
                      <SelectValue placeholder="Project" />
                    </SelectTrigger>
                    <SelectContent>
                      {links.map((link) => {
                        const project = catalog.allProjects.find((item) => item.id === link.project_id)
                        return (
                          <SelectItem key={link.project_id} value={link.project_id}>
                            {project?.name}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-9 min-w-0 flex-1"
                    value={activityName}
                    onChange={(e) => setActivityName(e.target.value)}
                    placeholder="Activity name"
                  />
                  <Button type="submit" className="h-9">
                    Add
                  </Button>
                </form>
              ) : null}
              {clientActivities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activities yet.</p>
              ) : (
                <ul>
                  {clientActivities.map((activity) => {
                    const project = catalog.allProjects.find((item) => item.id === activity.project_id)
                    return (
                      <li key={activity.id} className="flex items-center gap-2 py-1.5 text-sm">
                        <span className="size-2.5 shrink-0 rounded-sm" style={{ background: project?.color || '#5E5C57' }} aria-hidden="true" />
                        <span className="truncate">{activity.name}</span>
                        <span className="text-muted-foreground">{project?.name}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </>
        ) : null}
        {canManage ? (
          <Button className="mt-4" onClick={() => void save()} disabled={!name.trim()}>
            Save client
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function NameList({
  label,
  items,
  onCreate,
  canManage,
}: {
  label: string
  items: string[]
  onCreate: (name: string) => Promise<void>
  canManage: boolean
}) {
  const [name, setName] = useState('')
  const mutate = useMutation({ mutationFn: onCreate })
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {canManage ? (
        <form
          className="flex h-9 shrink-0 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            mutate.mutate(name.trim())
            setName('')
          }}
        >
          <Input className="h-9" value={name} onChange={(e) => setName(e.target.value)} placeholder={label} />
          <Button type="submit" className="h-9">
            Add
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">Only owners and admins can edit this list.</p>
      )}
      <ul className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
        {items.length === 0 ? (
          <li className="px-3 py-3 text-sm text-muted-foreground">Nothing here yet. Add one above.</li>
        ) : (
          items.map((item) => (
            <li key={item} className="border-t border-border px-3 py-2.5 text-sm first:border-t-0">
              {item}
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

function AliasEditor({
  catalog,
  canManage,
  needWorkspace,
  workspaceId,
  onSaved,
}: {
  catalog: ReturnType<typeof useCatalog>
  canManage: boolean
  needWorkspace: () => boolean
  workspaceId: string
  onSaved: () => void
}) {
  const [shortcut, setShortcut] = useState('')
  const [projectId, setProjectId] = useState('')
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {canManage ? (
        <form
          className="flex h-9 shrink-0 items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!needWorkspace() || !projectId || !shortcut.trim()) return
            const { error } = await supabase.from('project_aliases').insert({
              workspace_id: workspaceId,
              shortcut: shortcut.trim(),
              project_id: projectId,
            })
            if (error) throw error
            setShortcut('')
            onSaved()
          }}
        >
          <Input
            className="h-9 w-32 font-mono"
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
            placeholder="Shortcut"
          />
          <Select value={projectId || undefined} onValueChange={setProjectId}>
            <SelectTrigger className="min-w-0 flex-1">
              <SelectValue placeholder="Official project" />
            </SelectTrigger>
            <SelectContent>
              {catalog.allProjects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" className="h-9">
            Add alias
          </Button>
        </form>
      ) : null}
      <ul className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
        {catalog.aliases.length === 0 ? (
          <li className="px-3 py-3 text-sm text-muted-foreground">Nothing here yet. Add one above.</li>
        ) : (
          catalog.aliases.map((alias) => {
            const project = catalog.allProjects.find((item) => item.id === alias.project_id)
            return (
              <li key={alias.id} className="flex items-center gap-2 border-t border-border px-3 py-2.5 text-sm first:border-t-0">
                <span className="font-mono">{alias.shortcut}</span>
                <span className="text-muted-foreground">→</span>
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: project?.color || '#5E5C57' }} aria-hidden="true" />
                {project?.name}
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}

function ProjectEditor({
  catalog,
  canManage,
  needWorkspace,
  workspaceId,
  onError,
  onSaved,
}: {
  catalog: ReturnType<typeof useCatalog>
  canManage: boolean
  needWorkspace: () => boolean
  workspaceId: string
  onError: (msg: string | null) => void
  onSaved: () => void
}) {
  const [editing, setEditing] = useState<Project | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [billable, setBillable] = useState(true)
  const [rate, setRate] = useState('')
  const [currency, setCurrency] = useState('SEK')
  const [splits, setSplits] = useState<SplitShare[]>([])
  const [tagIds, setTagIds] = useState<string[]>([])
  const [activityName, setActivityName] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  function load(project?: Project) {
    setEditing(project ?? null)
    setName(project?.name ?? '')
    setDescription(project?.description ?? '')
    setColor(project?.color ?? DEFAULT_COLOR)
    setBillable(project?.billable ?? true)
    setActivityName('')
    setRate(project?.hourly_rate != null ? String(project.hourly_rate) : '')
    setCurrency(project?.currency ?? 'SEK')
    if (project) {
      setSplits(
        catalog.projectClients
          .filter((row) => row.project_id === project.id)
          .map((row) => ({ clientId: row.client_id, percent: Number(row.split_percent) })),
      )
      setTagIds(catalog.projectTags.filter((row) => row.project_id === project.id).map((row) => row.tag_id))
    } else {
      setSplits([])
      setTagIds([])
    }
  }

  const total = splitsTotal(splits)
  const uniqueClients = new Set(splits.map((row) => row.clientId)).size === splits.length
  const valid = Boolean(name.trim()) && (splits.length === 0 || (total === 100 && uniqueClients))

  async function save() {
    if (!needWorkspace() || !valid) {
      onError(
        splits.length === 0
          ? 'Project needs a name.'
          : 'Client splits must be unique and sum to 100, or leave clients empty.',
      )
      return
    }
    onError(null)
    const payload = {
      name: name.trim(),
      description: description.trim(),
      color,
      billable,
      hourly_rate: rate.trim() === '' ? null : Number(rate),
      currency,
    }
    try {
      let saved: Project
      if (editing) {
        const { data, error } = await supabase.from('projects').update(payload).eq('id', editing.id).select('*').single()
        if (error) throw error
        saved = data as Project
      } else {
        const { data, error } = await supabase
          .from('projects')
          .insert({ workspace_id: workspaceId, ...payload })
          .select('*')
          .single()
        if (error) throw error
        saved = data as Project
      }
      qc.setQueryData(qk.projects(workspaceId), (current: Project[] | undefined) => {
        const list = current ?? []
        const index = list.findIndex((item) => item.id === saved.id)
        if (index >= 0) {
          const next = [...list]
          next[index] = saved
          return next
        }
        return [...list, saved]
      })
      load(saved)
      toast({ tone: 'success', title: 'Project saved', description: saved.name })
      const { error: splitErr } = await supabase.rpc('replace_project_clients', {
        p_project_id: saved.id,
        p_splits: splits.map((row) => ({ client_id: row.clientId, split_percent: row.percent })),
      })
      if (splitErr) throw splitErr
      const { error: tagErr } = await supabase.rpc('replace_project_tags', {
        p_project_id: saved.id,
        p_tag_ids: tagIds,
      })
      if (tagErr) throw tagErr
      onSaved()
    } catch (err) {
      toast({ tone: 'error', title: 'Could not save project', description: err instanceof Error ? err.message : 'Try again.' })
    }
  }

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <ul className="min-h-0 h-full overflow-y-auto rounded-lg border border-border">
        {catalog.allProjects.length === 0 ? (
          <li className="px-3 py-3 text-sm text-muted-foreground">No projects yet. Use New project.</li>
        ) : (
          catalog.allProjects.map((project) => {
            const chips = catalog.projectClients
              .filter((row) => row.project_id === project.id)
              .map((row) => {
                const client = catalog.clients.find((item) => item.id === row.client_id)
                return `${client?.name ?? 'Client'} ${Number(row.split_percent)}%`
              })
            const selected = editing?.id === project.id
            return (
              <li key={project.id} className="border-t border-border first:border-t-0">
                <button
                  type="button"
                  className={cn('block w-full px-3 py-2.5 text-left', selected && 'bg-muted')}
                  onClick={() => load(project)}
                >
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-sm" style={{ background: project.color }} aria-hidden="true" />
                    <span className="truncate text-sm font-medium">{project.name}</span>
                    {project.description ? (
                      <span className="min-w-0 truncate text-sm text-muted-foreground">{project.description}</span>
                    ) : null}
                  </div>
                  {chips.length > 0 ? (
                    <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">{chips.join(' · ')}</p>
                  ) : null}
                </button>
              </li>
            )
          })
        )}
      </ul>
      <div className="h-full min-h-0 overflow-y-auto rounded-lg border border-border bg-card p-4">
        <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground">
          {editing ? 'PROJECT' : 'NEW PROJECT'}
        </p>
        {!canManage ? <p className="mt-2 text-sm text-muted-foreground">View only.</p> : null}
        <div className="mt-4 grid gap-1.5">
          <Label htmlFor="pname">Name</Label>
          <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} />
        </div>
        <div className="mt-3 grid gap-1.5">
          <Label htmlFor="pdesc">Description</Label>
          <Input
            id="pdesc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canManage}
            placeholder="Optional"
          />
        </div>
        <div className="mt-3 grid gap-1.5">
          <Label>Color</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={swatch}
                aria-pressed={color.toUpperCase() === swatch.toUpperCase()}
                disabled={!canManage}
                className={cn(
                  'size-6 rounded-sm',
                  color.toUpperCase() === swatch.toUpperCase() ? 'outline outline-1 outline-offset-1 outline-foreground' : '',
                )}
                style={{ background: swatch }}
                onClick={() => setColor(swatch)}
              />
            ))}
            <button
              type="button"
              disabled={!canManage}
              className="relative size-6 overflow-hidden rounded-sm border border-border"
              aria-label="Custom color"
              onClick={() => picker.current?.click()}
            >
              <span className="absolute inset-0" style={{ background: color }} />
              <input
                ref={picker}
                type="color"
                value={color}
                disabled={!canManage}
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(e) => setColor(e.target.value)}
              />
            </button>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Switch checked={billable} onCheckedChange={setBillable} disabled={!canManage} id="pbill" />
          <Label htmlFor="pbill">Billable by default</Label>
        </div>
        <div className="mt-4 grid gap-1.5">
          <Label htmlFor="prate">Hourly rate</Label>
          <div className="flex h-9 items-center gap-2">
            <Input
              id="prate"
              className="h-9 min-w-0 flex-1"
              type="number"
              min={0}
              step={0.01}
              value={rate}
              disabled={!canManage}
              placeholder="Optional"
              onChange={(e) => setRate(e.target.value)}
            />
            <Select value={currency} onValueChange={setCurrency} disabled={!canManage}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4">
          <p className="mb-1 text-sm font-medium">Client splits ({splits.length === 0 ? 'none' : `${total}%`})</p>
          <p className="mb-2 text-sm text-muted-foreground">Optional. Leave empty for personal or internal projects.</p>
          <div className="mb-2 flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                size="sm"
                variant="outline"
                disabled={!canManage || splits.length !== preset.parts.length}
                onClick={() =>
                  setSplits((current) => current.map((row, i) => ({ ...row, percent: preset.parts[i] ?? row.percent })))
                }
              >
                {preset.label}
              </Button>
            ))}
          </div>
          {splits.map((split, index) => (
            <div key={`${split.clientId}-${index}`} className="mb-2 flex gap-2">
              <Select
                value={split.clientId}
                disabled={!canManage}
                onValueChange={(value) =>
                  setSplits((rows) => rows.map((row, i) => (i === index ? { ...row, clientId: value } : row)))
                }
              >
                <SelectTrigger className="w-2/5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {catalog.clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative w-24">
                <Input
                  className="w-24 pr-7"
                  type="number"
                  min={0.01}
                  max={100}
                  step={0.01}
                  value={split.percent}
                  disabled={!canManage}
                  onChange={(e) =>
                    setSplits((rows) =>
                      rows.map((row, i) => (i === index ? { ...row, percent: Number(e.target.value) } : row)),
                    )
                  }
                />
                <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">
                  %
                </span>
              </div>
              {canManage ? (
                <Button type="button" variant="ghost" onClick={() => setSplits((rows) => rows.filter((_, i) => i !== index))}>
                  Remove
                </Button>
              ) : null}
            </div>
          ))}
          {canManage ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const next = catalog.clients.find((client) => !splits.some((row) => row.clientId === client.id))
                if (!next) return
                setSplits((rows) => [...rows, { clientId: next.id, percent: rows.length === 0 ? 100 : 0 }])
              }}
            >
              Add client
            </Button>
          ) : null}
        </div>
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium">Quick-start tags</p>
          <div className="flex flex-col gap-2">
            {catalog.tags.map((tag) => (
              <label key={tag.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={tagIds.includes(tag.id)}
                  disabled={!canManage}
                  onCheckedChange={(value) =>
                    setTagIds((ids) => (value === true ? [...ids, tag.id] : ids.filter((id) => id !== tag.id)))
                  }
                />
                {tag.name}
              </label>
            ))}
          </div>
        </div>
        {editing ? (
          <>
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium">Activities</p>
              {canManage ? (
                <form
                  className="mb-2 flex h-9 items-center gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (!needWorkspace() || !activityName.trim()) return
                    const { error } = await supabase.from('activities').insert({
                      workspace_id: workspaceId,
                      project_id: editing.id,
                      client_id: null,
                      name: activityName.trim(),
                    })
                    if (error) {
                      onError(error.message)
                      return
                    }
                    setActivityName('')
                    onSaved()
                  }}
                >
                  <Input
                    className="h-9 min-w-0 flex-1"
                    value={activityName}
                    onChange={(e) => setActivityName(e.target.value)}
                    placeholder="Activity name"
                  />
                  <Button type="submit" className="h-9">
                    Add
                  </Button>
                </form>
              ) : null}
              {catalog.activities.filter((row) => row.project_id === editing.id && row.client_id == null).length === 0 ? (
                <p className="text-sm text-muted-foreground">No project activities yet.</p>
              ) : (
                <ul>
                  {catalog.activities
                    .filter((row) => row.project_id === editing.id && row.client_id == null)
                    .map((activity) => (
                      <li key={activity.id} className="py-1.5 text-sm">
                        {activity.name}
                      </li>
                    ))}
                </ul>
              )}
            </div>
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium">From clients</p>
              {catalog.activities.filter((row) => row.project_id === editing.id && row.client_id != null).length === 0 ? (
                <p className="text-sm text-muted-foreground">No client activities on this project.</p>
              ) : (
                <ul>
                  {catalog.activities
                    .filter((row) => row.project_id === editing.id && row.client_id != null)
                    .map((activity) => {
                      const client = catalog.clients.find((item) => item.id === activity.client_id)
                      return (
                        <li key={activity.id} className="flex items-center gap-2 py-1.5 text-sm">
                          <span className="truncate">{activity.name}</span>
                          <span className="text-muted-foreground">{client?.name}</span>
                        </li>
                      )
                    })}
                </ul>
              )}
            </div>
          </>
        ) : null}
        {canManage ? (
          <Button className="mt-4" onClick={() => void save()} disabled={!valid}>
            Save project
          </Button>
        ) : null}
      </div>
    </div>
  )
}
