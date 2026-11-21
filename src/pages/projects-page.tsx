import { EllipsisHorizontalIcon, InformationCircleIcon, PencilIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { mirrorSensitive } from '@/features/crypto/field-mirror'
import { useCatalog } from '@/features/projects/use-catalog'
import { useWorkspace } from '@/features/workspaces/workspace-context'
import { qk } from '@/lib/query-keys'
import { splitsTotal, type SplitShare } from '@/lib/splits'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { Activity, Client, Project, ProjectAlias, ProjectClient } from '@/types'

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

type Section = 'projects' | 'clients'

function failMessage(err: unknown) {
  const rec = err && typeof err === 'object' ? (err as Record<string, unknown>) : null
  const message =
    rec && typeof rec.message === 'string' ? rec.message : err instanceof Error ? err.message : ''
  const details = rec && typeof rec.details === 'string' ? rec.details : ''
  const hint = rec && typeof rec.hint === 'string' ? rec.hint : ''
  const code = rec && typeof rec.code === 'string' ? rec.code : ''
  const joined = [message, details, hint].filter(Boolean).join(' ')
  if (code === '23505' || /projects_workspace_id_name|duplicate key value.*projects/i.test(joined)) {
    return 'A project with this name already exists.'
  }
  return joined || 'Try again.'
}

async function deleteActivity(id: string, onSaved: () => void) {
  const { error } = await supabase.from('activities').delete().eq('id', id)
  if (error) {
    toast.error('Could not delete activity', { description: failMessage(error) })
    return
  }
  onSaved()
}

async function setActivityDefault(activity: Activity, onSaved: () => void) {
  const { error } = await supabase.from('activities').update({ is_default: !activity.is_default }).eq('id', activity.id)
  if (error) {
    toast.error(activity.is_default ? 'Could not clear default' : 'Could not set default', { description: failMessage(error) })
  } else {
    onSaved()
  }
}

async function renameActivity(id: string, name: string, onSaved: () => void) {
  const { error } = await supabase.from('activities').update({ name }).eq('id', id)
  if (error) {
    toast.error('Could not rename activity', { description: failMessage(error) })
    return false
  }
  await mirrorSensitive('activities', id, { name })
  onSaved()
  return true
}

async function moveActivity(
  id: string,
  patch: { project_id: string } | { client_id: string },
  onSaved: () => void,
) {
  const { error } = await supabase.from('activities').update(patch).eq('id', id)
  if (error) {
    toast.error('Could not move activity', { description: failMessage(error) })
    return false
  }
  onSaved()
  return true
}

function RemoveActivityButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" onClick={onClick} aria-label="Remove activity">
      <XMarkIcon />
    </Button>
  )
}

function ActivityRowMenu({
  onRename,
  onMove,
  onToggleDefault,
  isDefault,
}: {
  onRename: () => void
  onMove?: () => void
  onToggleDefault?: () => void
  isDefault?: boolean
}) {
  return (
    <div className="ml-auto flex shrink-0 items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Activity actions">
            <EllipsisHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
          {onMove ? <DropdownMenuItem onSelect={onMove}>Move</DropdownMenuItem> : null}
          {onToggleDefault ? (
            <DropdownMenuItem onSelect={onToggleDefault}>{isDefault ? 'Clear default' : 'Set as default'}</DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function ActivityRenameDialog({
  activity,
  open,
  onOpenChange,
  onSaved,
}: {
  activity: Activity | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<{ id: string; name: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const name = open && activity ? (draft?.id === activity.id ? draft.name : activity.name) : ''
  const trimmed = name.trim()
  const dirty = activity != null && trimmed.length > 0 && trimmed !== activity.name.trim()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setDraft(null)
          setSaving(false)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename activity</DialogTitle>
          <DialogDescription>Logged time stays on this activity.</DialogDescription>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => {
            if (!activity) return
            setDraft({ id: activity.id, name: e.target.value })
          }}
          placeholder="Activity name"
          autoFocus
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!dirty || saving}
            loading={saving}
            onClick={() => {
              if (!activity || !dirty) return
              setSaving(true)
              void renameActivity(activity.id, trimmed, onSaved).then((ok) => {
                setSaving(false)
                if (ok) onOpenChange(false)
              })
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ActivityMoveDialog({
  activity,
  projects,
  clients,
  open,
  onOpenChange,
  onSaved,
}: {
  activity: Activity | null
  projects: Project[]
  clients: Client[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [targetId, setTargetId] = useState('')
  const [saving, setSaving] = useState(false)
  const clientActivity = Boolean(activity?.client_id)
  const options = clientActivity
    ? clients.filter((client) => client.id !== activity?.client_id)
    : projects.filter((project) => project.id !== activity?.project_id)
  const ready = Boolean(targetId) && options.some((option) => option.id === targetId)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setTargetId('')
          setSaving(false)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {activity?.name ?? 'activity'}</DialogTitle>
          <DialogDescription>
            {clientActivity
              ? 'Move this client activity to another client. It stays on the same project.'
              : 'Move this project activity to another project.'}
          </DialogDescription>
        </DialogHeader>
        <Select value={targetId || undefined} onValueChange={setTargetId}>
          <SelectTrigger>
            <SelectValue placeholder={clientActivity ? 'Client' : 'Project'} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!ready || saving || !activity}
            loading={saving}
            onClick={() => {
              if (!activity || !ready) return
              setSaving(true)
              const patch = clientActivity ? { client_id: targetId } : { project_id: targetId }
              void moveActivity(activity.id, patch, onSaved).then((ok) => {
                setSaving(false)
                if (ok) onOpenChange(false)
              })
            }}
          >
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DraftRenameDialog({
  current,
  open,
  onOpenChange,
  onSave,
  title = 'Rename activity',
  placeholder = 'Activity name',
}: {
  current: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (next: string) => boolean | Promise<boolean>
  title?: string
  placeholder?: string
}) {
  const [draft, setDraft] = useState<{ current: string; name: string } | null>(null)
  const name = open && current != null ? (draft?.current === current ? draft.name : current) : ''
  const trimmed = name.trim()
  const dirty = current != null && trimmed.length > 0 && trimmed !== current.trim()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setDraft(null)
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => {
            if (current == null) return
            setDraft({ current, name: e.target.value })
          }}
          placeholder={placeholder}
          autoFocus
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!dirty}
            onClick={() => {
              if (!dirty) return
              void Promise.resolve(onSave(trimmed)).then((ok) => {
                if (ok) onOpenChange(false)
              })
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AliasChip({
  shortcut,
  canManage,
  onRename,
  onDelete,
}: {
  shortcut: string
  canManage: boolean
  onRename: () => void
  onDelete: () => void
}) {
  return (
    <Badge variant="secondary" className="group gap-0.5 font-mono">
      {shortcut}
      {canManage ? (
        <span className="inline-flex items-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            className="inline-flex size-4 items-center justify-center rounded-sm hover:bg-background/60"
            aria-label={`Rename ${shortcut}`}
            onClick={onRename}
          >
            <PencilIcon className="size-3" />
          </button>
          <button
            type="button"
            className="inline-flex size-4 items-center justify-center rounded-sm hover:bg-background/60"
            aria-label={`Delete ${shortcut}`}
            onClick={onDelete}
          >
            <XMarkIcon className="size-3" />
          </button>
        </span>
      ) : null}
    </Badge>
  )
}

function ConfirmDeleteDialog({
  name,
  open,
  onOpenChange,
  onConfirm,
}: {
  name: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-bold text-destructive">Delete {name}?</DialogTitle>
          <DialogDescription>This action is irreversible.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={!name} onClick={onConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ProjectsPage() {
  const { workspaceId, isAll, canManage, canManageWorkspace, workspaces } = useWorkspace()
  const catalog = useCatalog()
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [section, setSection] = useState<Section>('projects')
  const [draftKey, setDraftKey] = useState(0)
  const [clientKey, setClientKey] = useState(0)
  const [createFor, setCreateFor] = useState<Section | null>(null)
  const [pickedWorkspace, setPickedWorkspace] = useState('')
  const [projectWorkspaceId, setProjectWorkspaceId] = useState<string | null>(null)
  const [clientWorkspaceId, setClientWorkspaceId] = useState<string | null>(null)
  const manageable = workspaces.filter((workspace) => canManageWorkspace(workspace.id))
  const canCreate = isAll ? manageable.length > 0 : canManage

  function openCreate(next: Section) {
    if (!isAll) {
      if (next === 'projects') {
        setProjectWorkspaceId(workspaceId)
        setDraftKey((n) => n + 1)
      } else {
        setClientWorkspaceId(workspaceId)
        setClientKey((n) => n + 1)
      }
      setSection(next)
      return
    }
    setPickedWorkspace(manageable[0]?.id ?? '')
    setCreateFor(next)
  }

  function confirmCreate() {
    if (!createFor || !pickedWorkspace) return
    if (createFor === 'projects') {
      setProjectWorkspaceId(pickedWorkspace)
      setDraftKey((n) => n + 1)
    } else {
      setClientWorkspaceId(pickedWorkspace)
      setClientKey((n) => n + 1)
    }
    setSection(createFor)
    setCreateFor(null)
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
        {canCreate && section === 'projects' ? (
          <Button variant="outline" className="ml-auto" onClick={() => openCreate('projects')}>
            New project
          </Button>
        ) : null}
        {canCreate && section === 'clients' ? (
          <Button variant="outline" className="ml-auto" onClick={() => openCreate('clients')}>
            New client
          </Button>
        ) : null}
      </div>
      {section === 'projects' ? (
        <ProjectEditor
          key={draftKey}
          canManageWorkspace={canManageWorkspace}
          catalog={catalog}
          catalogWorkspaceId={workspaceId}
          createWorkspaceId={isAll ? projectWorkspaceId : workspaceId}
          onError={setError}
          onSaved={() => void refresh()}
        />
      ) : null}
      {section === 'clients' ? (
        <ClientEditor
          key={clientKey}
          canManageWorkspace={canManageWorkspace}
          catalog={catalog}
          catalogWorkspaceId={workspaceId}
          createWorkspaceId={isAll ? clientWorkspaceId : workspaceId}
          onError={setError}
          onSaved={() => void refresh()}
        />
      ) : null}
      <Dialog
        open={createFor != null}
        onOpenChange={(open) => {
          if (!open) setCreateFor(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{createFor === 'clients' ? 'New client' : 'New project'}</DialogTitle>
            <DialogDescription>Choose the workspace this belongs to.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="create-workspace">Workspace</Label>
            <Select value={pickedWorkspace} onValueChange={setPickedWorkspace}>
              <SelectTrigger id="create-workspace">
                <SelectValue placeholder="Workspace" />
              </SelectTrigger>
              <SelectContent>
                {manageable.map((workspace) => (
                  <SelectItem key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateFor(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={!pickedWorkspace} onClick={confirmCreate}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ClientEditor({
  catalog,
  canManageWorkspace,
  createWorkspaceId,
  catalogWorkspaceId,
  onError,
  onSaved,
}: {
  catalog: ReturnType<typeof useCatalog>
  canManageWorkspace: (id: string) => boolean
  createWorkspaceId: string | null
  catalogWorkspaceId: string
  onError: (msg: string | null) => void
  onSaved: () => void
}) {
  const [editing, setEditing] = useState<Client | null>(null)
  const [name, setName] = useState('')
  const [billable, setBillable] = useState(true)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [activityName, setActivityName] = useState('')
  const [activityProjectId, setActivityProjectId] = useState('')
  const [saving, setSaving] = useState(false)
  const [snapshot, setSnapshot] = useState({ name: '', billable: true, overrides: {} as Record<string, string> })
  const [pendingActivity, setPendingActivity] = useState<{ id: string; name: string } | null>(null)
  const [renaming, setRenaming] = useState<Activity | null>(null)
  const [moving, setMoving] = useState<Activity | null>(null)
  const qc = useQueryClient()

  function load(client?: Client) {
    const nextName = client?.name ?? ''
    const nextBillable = client?.default_billable ?? true
    const nextOverrides: Record<string, string> = {}
    if (client) {
      for (const row of catalog.projectClients.filter((item) => item.client_id === client.id)) {
        nextOverrides[row.project_id] = row.hourly_rate != null ? String(row.hourly_rate) : ''
      }
    }
    setEditing(client ?? null)
    setName(nextName)
    setBillable(nextBillable)
    setActivityName('')
    setOverrides(nextOverrides)
    setSnapshot({ name: nextName, billable: nextBillable, overrides: nextOverrides })
    setPendingActivity(null)
    setRenaming(null)
    setMoving(null)
    if (client) {
      const first = catalog.projectClients.find((item) => item.client_id === client.id)
      setActivityProjectId(first?.project_id ?? '')
    } else {
      setActivityProjectId('')
    }
  }

  const activeWorkspaceId = editing?.workspace_id ?? createWorkspaceId ?? ''
  const canManage = Boolean(activeWorkspaceId) && canManageWorkspace(activeWorkspaceId)
  const links = editing ? catalog.projectClients.filter((row) => row.client_id === editing.id) : []
  const clientActivities = editing ? catalog.activities.filter((row) => row.client_id === editing.id) : []
  const clientDirty =
    name !== snapshot.name ||
    billable !== snapshot.billable ||
    Object.keys({ ...snapshot.overrides, ...overrides }).some(
      (key) => (overrides[key] ?? '') !== (snapshot.overrides[key] ?? ''),
    )

  async function save() {
    if (!name.trim()) {
      onError('Client needs a name.')
      return
    }
    const targetWorkspaceId = editing?.workspace_id ?? createWorkspaceId
    if (!targetWorkspaceId) {
      toast.error('Could not save client', { description: 'Choose a workspace.' })
      return
    }
    onError(null)
    setSaving(true)
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
          .insert({ workspace_id: targetWorkspaceId, name: name.trim(), default_billable: billable })
          .select('*')
          .single()
        if (error) throw error
        saved = data as Client
      }
      const keptName = name.trim()
      saved = { ...saved, name: keptName }
      await mirrorSensitive('clients', saved.id, { name: keptName })
      qc.setQueryData(qk.clients(catalogWorkspaceId), (current: Client[] | undefined) => {
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
      for (const row of catalog.projectClients.filter((item) => item.client_id === saved.id)) {
        const raw = overrides[row.project_id] ?? ''
        const { error } = await supabase.rpc('set_project_client_rate', {
          p_project_id: row.project_id,
          p_client_id: saved.id,
          p_hourly_rate: raw.trim() === '' ? null : Number(raw),
        })
        if (error) throw error
      }
      setSnapshot({ name: saved.name, billable: saved.default_billable, overrides: { ...overrides } })
      onSaved()
      toast.success('Client saved', { description: saved.name })
    } catch (err) {
      toast.error('Could not save client', { description: failMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  async function addActivity() {
    if (!editing || !activityName.trim() || !activityProjectId) return
    const { data, error } = await supabase.from('activities').insert({
      workspace_id: editing.workspace_id,
      project_id: activityProjectId,
      client_id: editing.id,
      name: activityName.trim(),
    }).select('id').single()
    if (error) throw error
    await mirrorSensitive('activities', data.id, { name: activityName.trim() })
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
                  <p className="truncate text-sm font-medium leading-5">{client.name}</p>
                  <p className="mt-1 min-h-4 font-mono text-[11px] leading-4 tabular-nums text-muted-foreground">
                    {count > 0 ? `${count} ${count === 1 ? 'project' : 'projects'}` : ''}
                  </p>
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
                      {link.split_percent != null ? (
                        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                          {Number(link.split_percent)}%
                        </span>
                      ) : null}
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
                  <Button type="submit" className="h-9" disabled={!activityName.trim() || !activityProjectId}>
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
                        {canManage ? (
                          <>
                            <ActivityRowMenu
                              onRename={() => setRenaming(activity)}
                              onMove={() => setMoving(activity)}
                            />
                            <RemoveActivityButton onClick={() => setPendingActivity({ id: activity.id, name: activity.name })} />
                          </>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </>
        ) : null}
        {canManage ? (
          <div className="mt-4 flex justify-end">
            <Button onClick={() => void save()} disabled={!clientDirty} loading={saving}>
              Save client
            </Button>
          </div>
        ) : null}
        <ActivityRenameDialog
          activity={renaming}
          open={Boolean(renaming)}
          onOpenChange={(open) => {
            if (!open) setRenaming(null)
          }}
          onSaved={onSaved}
        />
        <ActivityMoveDialog
          activity={moving}
          projects={catalog.allProjects.filter((project) => project.workspace_id === moving?.workspace_id)}
          clients={catalog.clients.filter((client) => client.workspace_id === moving?.workspace_id)}
          open={Boolean(moving)}
          onOpenChange={(open) => {
            if (!open) setMoving(null)
          }}
          onSaved={onSaved}
        />
        <ConfirmDeleteDialog
          name={pendingActivity?.name ?? null}
          open={Boolean(pendingActivity)}
          onOpenChange={(open) => {
            if (!open) setPendingActivity(null)
          }}
          onConfirm={() => {
            if (!pendingActivity) return
            const id = pendingActivity.id
            setPendingActivity(null)
            void deleteActivity(id, onSaved)
          }}
        />
      </div>
    </div>
  )
}

function ProjectEditor({
  catalog,
  canManageWorkspace,
  createWorkspaceId,
  catalogWorkspaceId,
  onError,
  onSaved,
}: {
  catalog: ReturnType<typeof useCatalog>
  canManageWorkspace: (id: string) => boolean
  createWorkspaceId: string | null
  catalogWorkspaceId: string
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
  const [activityName, setActivityName] = useState('')
  const [shortcut, setShortcut] = useState('')
  const [draftActivities, setDraftActivities] = useState<string[]>([])
  const [draftAliases, setDraftAliases] = useState<string[]>([])
  const [saveHint, setSaveHint] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [pendingActivity, setPendingActivity] = useState<{ id: string; name: string } | { draft: string } | null>(null)
  const [renaming, setRenaming] = useState<Activity | null>(null)
  const [moving, setMoving] = useState<Activity | null>(null)
  const [renamingDraft, setRenamingDraft] = useState<string | null>(null)
  const [renamingAlias, setRenamingAlias] = useState<{ id: string; shortcut: string } | { draft: string } | null>(null)
  const [pendingAlias, setPendingAlias] = useState<{ id: string; shortcut: string } | { draft: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [snapshot, setSnapshot] = useState({
    name: '',
    description: '',
    color: DEFAULT_COLOR,
    billable: true,
    rate: '',
    currency: 'SEK',
    splits: [] as SplitShare[],
  })
  const picker = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  function load(project?: Project) {
    const nextName = project?.name ?? ''
    const nextDescription = project?.description ?? ''
    const nextColor = project?.color ?? DEFAULT_COLOR
    const nextBillable = project?.billable ?? true
    const nextRate = project?.hourly_rate != null ? String(project.hourly_rate) : ''
    const nextCurrency = project?.currency ?? 'SEK'
    const nextSplits = project
      ? catalog.projectClients
          .filter((row) => row.project_id === project.id)
          .map((row) => ({
            clientId: row.client_id,
            percent: row.split_percent == null ? null : Number(row.split_percent),
          }))
      : []
    setEditing(project ?? null)
    setName(nextName)
    setDescription(nextDescription)
    setColor(nextColor)
    setBillable(nextBillable)
    setActivityName('')
    setShortcut('')
    setDraftActivities([])
    setDraftAliases([])
    setPendingActivity(null)
    setRenaming(null)
    setMoving(null)
    setRenamingDraft(null)
    setRenamingAlias(null)
    setPendingAlias(null)
    setSaveHint(null)
    setRate(nextRate)
    setCurrency(nextCurrency)
    setSplits(nextSplits)
    setSnapshot({
      name: nextName,
      description: nextDescription,
      color: nextColor,
      billable: nextBillable,
      rate: nextRate,
      currency: nextCurrency,
      splits: nextSplits,
    })
  }

  const activeWorkspaceId = editing?.workspace_id ?? createWorkspaceId ?? ''
  const canManage = Boolean(activeWorkspaceId) && canManageWorkspace(activeWorkspaceId)
  const workspaceClients = catalog.clients.filter((client) => client.workspace_id === activeWorkspaceId)
  const clientActivityGroups = (() => {
    if (!editing) return []
    const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })
    const groups = new Map<string, { id: string; name: string; activities: Activity[] }>()
    for (const activity of catalog.activities) {
      if (activity.project_id !== editing.id || activity.client_id == null) continue
      const client = catalog.clients.find((item) => item.id === activity.client_id)
      const group = groups.get(activity.client_id) ?? {
        id: activity.client_id,
        name: client?.name ?? 'Client',
        activities: [],
      }
      group.activities.push(activity)
      groups.set(activity.client_id, group)
    }
    return [...groups.values()]
      .sort((a, b) => byName(a.name, b.name))
      .map((group) => ({ ...group, activities: [...group.activities].sort((a, b) => byName(a.name, b.name)) }))
  })()
  const total = splitsTotal(splits)
  const uniqueClients = new Set(splits.map((row) => row.clientId)).size === splits.length
  const noSplit = splits.every((row) => row.percent == null)
  const projectDirty =
    name !== snapshot.name ||
    description !== snapshot.description ||
    color.toUpperCase() !== snapshot.color.toUpperCase() ||
    billable !== snapshot.billable ||
    rate !== snapshot.rate ||
    currency !== snapshot.currency ||
    splits.length !== snapshot.splits.length ||
    splits.some(
      (row, index) =>
        row.clientId !== snapshot.splits[index]?.clientId || row.percent !== snapshot.splits[index]?.percent,
    ) ||
    draftActivities.length > 0 ||
    draftAliases.length > 0

  function invalidReason() {
    if (!name.trim()) return 'Project needs a name.'
    if (splits.length === 0) return null
    if (!uniqueClients) return 'Each client can only appear once.'
    if (noSplit) return null
    if (total !== 100) return `Client splits must sum to 100, currently ${total}.`
    return null
  }

  async function save() {
    const targetWorkspaceId = editing?.workspace_id ?? createWorkspaceId
    if (!targetWorkspaceId) {
      const msg = 'Choose a workspace.'
      setSaveHint(msg)
      toast.error('Could not save project', { description: msg })
      return
    }
    const reason = invalidReason()
    if (reason) {
      setSaveHint(reason)
      toast.error('Could not save project', { description: reason })
      return
    }
    setSaveHint(null)
    onError(null)
    setSaving(true)
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
          .insert({ workspace_id: targetWorkspaceId, ...payload })
          .select('*')
          .single()
        if (error) throw error
        saved = data as Project
      }
      const keptName = name.trim()
      const keptDescription = description.trim()
      saved = { ...saved, name: keptName, description: keptDescription }
      await mirrorSensitive('projects', saved.id, { name: keptName, description: keptDescription })
      qc.setQueryData(qk.projects(catalogWorkspaceId), (current: Project[] | undefined) => {
        const list = current ?? []
        const index = list.findIndex((item) => item.id === saved.id)
        if (index >= 0) {
          const next = [...list]
          next[index] = saved
          return next
        }
        return [...list, saved]
      })
      const { data: links, error: splitErr } = await supabase.rpc('replace_project_clients', {
        p_project_id: saved.id,
        p_splits: splits.map((row) => ({ client_id: row.clientId, split_percent: row.percent })),
      })
      if (splitErr) throw splitErr
      qc.setQueryData(qk.projectClients(catalogWorkspaceId), (current: ProjectClient[] | undefined) => {
        const rest = (current ?? []).filter((row) => row.project_id !== saved.id)
        return [...rest, ...((links ?? []) as ProjectClient[])]
      })
      const nextSnap = {
        name: saved.name,
        description: saved.description,
        color: saved.color,
        billable: saved.billable,
        rate: saved.hourly_rate != null ? String(saved.hourly_rate) : '',
        currency: saved.currency ?? 'SEK',
        splits: splits.map((row) => ({ ...row })),
      }
      setEditing(saved)
      setName(nextSnap.name)
      setDescription(nextSnap.description)
      setColor(nextSnap.color)
      setBillable(nextSnap.billable)
      setRate(nextSnap.rate)
      setCurrency(nextSnap.currency)
      setSplits(nextSnap.splits)
      setSnapshot(nextSnap)
      const leftoverActivities: string[] = []
      let draftError: string | null = null
      for (const item of draftActivities) {
        if (draftError) {
          leftoverActivities.push(item)
          continue
        }
        const { data, error } = await supabase
          .from('activities')
          .insert({ workspace_id: saved.workspace_id, project_id: saved.id, client_id: null, name: item })
          .select('*')
          .single()
        if (error) {
          draftError = failMessage(error)
          leftoverActivities.push(item)
        } else if (data) {
          await mirrorSensitive('activities', (data as Activity).id, { name: item })
          qc.setQueryData(qk.activities(catalogWorkspaceId), (current: Activity[] | undefined) => [...(current ?? []), data as Activity])
        }
      }
      const leftoverAliases: string[] = []
      for (const item of draftAliases) {
        if (draftError) {
          leftoverAliases.push(item)
          continue
        }
        const { data, error } = await supabase
          .from('project_aliases')
          .insert({ workspace_id: saved.workspace_id, project_id: saved.id, shortcut: item })
          .select('*')
          .single()
        if (error) {
          draftError = failMessage(error)
          leftoverAliases.push(item)
        } else if (data) {
          await mirrorSensitive('project_aliases', (data as ProjectAlias).id, { shortcut: item })
          qc.setQueryData(qk.aliases(catalogWorkspaceId), (current: ProjectAlias[] | undefined) => [
            ...(current ?? []),
            data as ProjectAlias,
          ])
        }
      }
      setDraftActivities(leftoverActivities)
      setDraftAliases(leftoverAliases)
      onSaved()
      if (draftError) throw new Error(draftError)
      toast.success('Project saved', { description: saved.name })
    } catch (err) {
      const msg = failMessage(err)
      setSaveHint(msg)
      toast.error('Could not save project', { description: msg })
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!editing || confirmName !== editing.name) return
    try {
      const { error } = await supabase.rpc('delete_project', { p_project_id: editing.id })
      if (error) throw error
      const removedId = editing.id
      const removedName = editing.name
      qc.setQueryData(qk.projects(catalogWorkspaceId), (current: Project[] | undefined) =>
        (current ?? []).filter((item) => item.id !== removedId),
      )
      setConfirmOpen(false)
      setConfirmName('')
      load()
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.entries(catalogWorkspaceId) }),
        qc.invalidateQueries({ queryKey: qk.requests(catalogWorkspaceId) }),
        qc.invalidateQueries({ queryKey: qk.activities(catalogWorkspaceId) }),
        qc.invalidateQueries({ queryKey: qk.aliases(catalogWorkspaceId) }),
        qc.invalidateQueries({ queryKey: qk.projectClients(catalogWorkspaceId) }),
        qc.invalidateQueries({ queryKey: qk.running }),
      ])
      toast.success('Project deleted', { description: removedName })
    } catch (err) {
      toast.error('Could not delete project', { description: failMessage(err) })
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
                const name = client?.name ?? 'Client'
                return {
                  name,
                  label: row.split_percent == null ? name : `${name} ${Number(row.split_percent)}%`,
                }
              })
              .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
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
                    <span className="truncate text-sm font-medium leading-5">{project.name}</span>
                    {project.description ? (
                      <span className="min-w-0 truncate text-sm leading-5 text-muted-foreground">{project.description}</span>
                    ) : null}
                  </div>
                  <p className="mt-1 min-h-4 font-mono text-[11px] leading-4 tabular-nums text-muted-foreground">
                    {chips.map((chip) => chip.label).join(' · ')}
                  </p>
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
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium">Aliases</p>
          {canManage ? (
            <form
              className="mb-2 flex h-9 items-center gap-2"
              onSubmit={async (e) => {
                e.preventDefault()
                const value = shortcut.trim()
                if (!value) return
                if (!editing) {
                  if (draftAliases.some((item) => item.toLowerCase() === value.toLowerCase())) return
                  setDraftAliases((rows) => [...rows, value])
                  setShortcut('')
                  return
                }
                const { data, error } = await supabase.from('project_aliases').insert({
                  workspace_id: editing.workspace_id,
                  project_id: editing.id,
                  shortcut: value,
                }).select('id').single()
                if (error) {
                  toast.error('Could not add alias', { description: failMessage(error) })
                  return
                }
                await mirrorSensitive('project_aliases', data.id, { shortcut: value })
                setShortcut('')
                onSaved()
                toast.success('Alias added', { description: value })
              }}
            >
              <Input
                className="h-9 min-w-0 flex-1 font-mono"
                value={shortcut}
                onChange={(e) => setShortcut(e.target.value)}
                placeholder="Shortcut"
              />
              <Button type="submit" className="h-9" disabled={!shortcut.trim()}>
                Add
              </Button>
            </form>
          ) : null}
          {(editing ? catalog.aliases.filter((row) => row.project_id === editing.id) : []).length === 0 &&
          draftAliases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No aliases yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {editing
                ? catalog.aliases
                    .filter((row) => row.project_id === editing.id)
                    .map((alias) => (
                      <AliasChip
                        key={alias.id}
                        shortcut={alias.shortcut}
                        canManage={canManage}
                        onRename={() => setRenamingAlias({ id: alias.id, shortcut: alias.shortcut })}
                        onDelete={() => setPendingAlias({ id: alias.id, shortcut: alias.shortcut })}
                      />
                    ))
                : null}
              {draftAliases.map((item) => (
                <AliasChip
                  key={`draft-${item}`}
                  shortcut={item}
                  canManage={canManage}
                  onRename={() => setRenamingAlias({ draft: item })}
                  onDelete={() => setPendingAlias({ draft: item })}
                />
              ))}
            </div>
          )}
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
        <div className="mt-4 flex h-9 items-center overflow-hidden rounded-md border border-input bg-background">
          <div className="flex h-full shrink-0 items-center gap-2 border-r border-input px-3">
            <Switch checked={billable} onCheckedChange={setBillable} disabled={!canManage} id="pbill" />
            <Label htmlFor="pbill">Billable</Label>
          </div>
          <Input
            id="prate"
            className="h-9 min-w-0 flex-1 rounded-none border-0 bg-transparent tabular-nums shadow-none focus-visible:ring-0"
            type="number"
            min={0}
            step={0.01}
            value={rate}
            disabled={!canManage}
            placeholder="Rate"
            aria-label="Hourly rate"
            onChange={(e) => setRate(e.target.value)}
          />
          <Select value={currency} onValueChange={setCurrency} disabled={!canManage}>
            <SelectTrigger className="h-9 w-[4.75rem] shrink-0 rounded-none border-0 border-l border-input bg-transparent" aria-label="Currency">
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
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            Clients ({splits.length === 0 ? 'none' : noSplit ? 'no split' : `${total}%`})
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="inline-flex text-muted-foreground" aria-label="About clients">
                  <InformationCircleIcon className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                A percentage split automatically assigns every log on this project to these clients. No split means you
                pick the client on each time entry, and each chosen client keeps the full hour. Leave clients empty for
                a personal or internal project.
              </TooltipContent>
            </Tooltip>
          </p>
          <div className="mb-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={noSplit ? 'default' : 'outline'}
              disabled={!canManage}
              onClick={() => setSplits((current) => current.map((row) => ({ ...row, percent: null })))}
            >
              No split
            </Button>
            {PRESETS.map((preset) => {
              const selected =
                !noSplit &&
                splits.length === preset.parts.length &&
                splits.every((row, i) => row.percent === preset.parts[i])
              return (
                <Button
                  key={preset.label}
                  type="button"
                  size="sm"
                  variant={selected ? 'default' : 'outline'}
                  disabled={!canManage || splits.length !== preset.parts.length}
                  onClick={() =>
                    setSplits((current) => current.map((row, i) => ({ ...row, percent: preset.parts[i] ?? row.percent })))
                  }
                >
                  {preset.label}
                </Button>
              )
            })}
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
                  {workspaceClients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {noSplit ? null : (
                <div className="relative w-24">
                  <Input
                    className="w-24 pr-7"
                    type="number"
                    min={0.01}
                    max={100}
                    step={0.01}
                    value={split.percent ?? ''}
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
              )}
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
                const next = workspaceClients.find((client) => !splits.some((row) => row.clientId === client.id))
                if (!next) return
                setSplits((rows) => [
                  ...rows,
                  { clientId: next.id, percent: noSplit ? null : rows.length === 0 ? 100 : 0 },
                ])
              }}
            >
              Add client
            </Button>
          ) : null}
        </div>
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium">Activities</p>
          {canManage ? (
            <form
              className="mb-2 flex h-9 items-center gap-2"
              onSubmit={async (e) => {
                e.preventDefault()
                const value = activityName.trim()
                if (!value) return
                if (!editing) {
                  if (draftActivities.some((item) => item.toLowerCase() === value.toLowerCase())) return
                  setDraftActivities((rows) => [...rows, value])
                  setActivityName('')
                  return
                }
                const { data, error } = await supabase.from('activities').insert({
                  workspace_id: editing.workspace_id,
                  project_id: editing.id,
                  client_id: null,
                  name: value,
                }).select('id').single()
                if (error) {
                  toast.error('Could not add activity', { description: failMessage(error) })
                  return
                }
                await mirrorSensitive('activities', data.id, { name: value })
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
              <Button type="submit" className="h-9" disabled={!activityName.trim()}>
                Add
              </Button>
            </form>
          ) : null}
          {(editing
            ? catalog.activities.filter((row) => row.project_id === editing.id && row.client_id == null)
            : []
          ).length === 0 && draftActivities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No project activities yet.</p>
          ) : (
            <ul>
              {editing
                ? catalog.activities
                    .filter((row) => row.project_id === editing.id && row.client_id == null)
                    .map((activity) => (
                      <li key={activity.id} className="flex items-center gap-2 py-1.5 text-sm">
                        <span className="min-w-0 flex-1 truncate">{activity.name}</span>
                        {activity.is_default ? <Badge variant="secondary">Default</Badge> : null}
                        {canManage ? (
                          <>
                            <ActivityRowMenu
                              isDefault={activity.is_default}
                              onRename={() => setRenaming(activity)}
                              onMove={() => setMoving(activity)}
                              onToggleDefault={() => void setActivityDefault(activity, onSaved)}
                            />
                            <RemoveActivityButton onClick={() => setPendingActivity({ id: activity.id, name: activity.name })} />
                          </>
                        ) : null}
                      </li>
                    ))
                : null}
              {draftActivities.map((item) => (
                <li key={`draft-${item}`} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{item}</span>
                  {canManage ? (
                    <>
                      <ActivityRowMenu onRename={() => setRenamingDraft(item)} />
                      <RemoveActivityButton onClick={() => setPendingActivity({ draft: item })} />
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium">From clients</p>
          {clientActivityGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No client activities on this project.</p>
          ) : (
            <div className="grid gap-2">
              {clientActivityGroups.map((group) => (
                <div key={group.id}>
                  <p className="text-xs font-medium text-muted-foreground">{group.name}</p>
                  <ul>
                    {group.activities.map((activity) => (
                      <li key={activity.id} className="truncate py-1 text-sm">
                        {activity.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
        {canManage ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {editing ? (
              <Button
                variant="destructive"
                onClick={() => {
                  setConfirmName('')
                  setConfirmOpen(true)
                }}
              >
                Delete project
              </Button>
            ) : null}
            <Button className="ml-auto" onClick={() => void save()} disabled={!projectDirty} loading={saving}>
              Save project
            </Button>
            {saveHint ? <p className="mt-0 basis-full text-sm text-destructive">{saveHint}</p> : null}
          </div>
        ) : null}
        <ActivityRenameDialog
          activity={renaming}
          open={Boolean(renaming)}
          onOpenChange={(open) => {
            if (!open) setRenaming(null)
          }}
          onSaved={onSaved}
        />
        <ActivityMoveDialog
          activity={moving}
          projects={catalog.allProjects.filter((project) => project.workspace_id === moving?.workspace_id)}
          clients={catalog.clients.filter((client) => client.workspace_id === moving?.workspace_id)}
          open={Boolean(moving)}
          onOpenChange={(open) => {
            if (!open) setMoving(null)
          }}
          onSaved={onSaved}
        />
        <DraftRenameDialog
          current={renamingDraft}
          open={Boolean(renamingDraft)}
          onOpenChange={(open) => {
            if (!open) setRenamingDraft(null)
          }}
          onSave={(next) => {
            const previous = renamingDraft
            if (!previous) return false
            if (draftActivities.some((item) => item !== previous && item.toLowerCase() === next.toLowerCase())) {
              toast.error('Could not rename activity', { description: 'An activity with this name already exists.' })
              return false
            }
            setDraftActivities((rows) => rows.map((row) => (row === previous ? next : row)))
            return true
          }}
        />
        <DraftRenameDialog
          current={renamingAlias ? ('draft' in renamingAlias ? renamingAlias.draft : renamingAlias.shortcut) : null}
          open={Boolean(renamingAlias)}
          title="Rename alias"
          placeholder="Shortcut"
          onOpenChange={(open) => {
            if (!open) setRenamingAlias(null)
          }}
          onSave={async (next) => {
            const current = renamingAlias
            if (!current) return false
            if ('draft' in current) {
              if (draftAliases.some((item) => item !== current.draft && item.toLowerCase() === next.toLowerCase())) {
                toast.error('Could not rename alias', { description: 'An alias with this shortcut already exists.' })
                return false
              }
              setDraftAliases((rows) => rows.map((row) => (row === current.draft ? next : row)))
              return true
            }
            const { error } = await supabase.from('project_aliases').update({ shortcut: next }).eq('id', current.id)
            if (error) {
              toast.error('Could not rename alias', { description: failMessage(error) })
              return false
            }
            await mirrorSensitive('project_aliases', current.id, { shortcut: next })
            onSaved()
            return true
          }}
        />
        <ConfirmDeleteDialog
          name={pendingAlias ? ('draft' in pendingAlias ? pendingAlias.draft : pendingAlias.shortcut) : null}
          open={Boolean(pendingAlias)}
          onOpenChange={(open) => {
            if (!open) setPendingAlias(null)
          }}
          onConfirm={() => {
            if (!pendingAlias) return
            if ('draft' in pendingAlias) {
              const shortcut = pendingAlias.draft
              setPendingAlias(null)
              setDraftAliases((rows) => rows.filter((row) => row !== shortcut))
              return
            }
            const id = pendingAlias.id
            setPendingAlias(null)
            void (async () => {
              const { error } = await supabase.from('project_aliases').delete().eq('id', id)
              if (error) {
                toast.error('Could not delete alias', { description: failMessage(error) })
                return
              }
              onSaved()
            })()
          }}
        />
        <ConfirmDeleteDialog
          name={pendingActivity ? ('draft' in pendingActivity ? pendingActivity.draft : pendingActivity.name) : null}
          open={Boolean(pendingActivity)}
          onOpenChange={(open) => {
            if (!open) setPendingActivity(null)
          }}
          onConfirm={() => {
            if (!pendingActivity) return
            if ('draft' in pendingActivity) {
              const name = pendingActivity.draft
              setPendingActivity(null)
              setDraftActivities((rows) => rows.filter((row) => row !== name))
              return
            }
            const id = pendingActivity.id
            setPendingActivity(null)
            void deleteActivity(id, onSaved)
          }}
        />
        <Dialog
          open={confirmOpen}
          onOpenChange={(open) => {
            setConfirmOpen(open)
            if (!open) setConfirmName('')
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-bold text-destructive">Delete {editing?.name}?</DialogTitle>
              <DialogDescription>
                Time entries, aliases, and activities on this project are removed, including client
                activities here. Clients and their activities on other projects stay.
                <span className="mt-2 block text-destructive">This action is irreversible.</span>
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="confirm-project">
                Type <span className="text-destructive">{editing?.name}</span> project to confirm
              </Label>
              <Input
                id="confirm-project"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setConfirmOpen(false)
                  setConfirmName('')
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!editing || confirmName !== editing.name}
                onClick={() => void remove()}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
