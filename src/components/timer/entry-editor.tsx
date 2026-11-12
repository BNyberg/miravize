import { format } from 'date-fns'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { controlClass, Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import type { Project, Tag, TimeEntry, Workspace } from '@/types'
import { cn } from '@/lib/utils'

type Point = { x: number; y: number }

type Draft = {
  mode: 'create' | 'edit' | 'start'
  entry?: TimeEntry
  workspaceId: string
  start?: Date
  end?: Date
  point: Point
}

function EntryEditor({
  draft,
  workspaces,
  showWorkspace,
  projects,
  tags,
  pending,
  onClose,
  onSave,
  onDelete,
}: {
  draft: Draft | null
  workspaces: Workspace[]
  showWorkspace: boolean
  projects: Project[]
  tags: Tag[]
  pending: boolean
  onClose: () => void
  onSave: (input: {
    mode: Draft['mode']
    id?: string
    workspaceId: string
    projectId: string
    description: string
    billable: boolean
    tagIds: string[]
    start?: Date
    end?: Date
  }) => void
  onDelete?: (id: string) => void
}) {
  const [workspaceId, setWorkspaceId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [description, setDescription] = useState('')
  const [billable, setBillable] = useState(true)
  const [tagIds, setTagIds] = useState<string[]>([])

  useEffect(() => {
    if (!draft) return
    const entry = draft.entry
    setWorkspaceId(entry?.workspace_id || draft.workspaceId)
    setProjectId(entry?.project_id ?? '')
    setDescription(entry?.description ?? '')
    setBillable(entry?.billable ?? true)
    setTagIds(entry?.time_entry_tags?.map((tag) => tag.tag_id) ?? [])
  }, [draft])

  const choices = projects.filter((project) => project.workspace_id === workspaceId)
  const label = draft?.mode === 'edit' ? 'Edit entry' : draft?.mode === 'start' ? 'Start timer' : 'New entry'

  return (
    <Popover open={Boolean(draft)} onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor asChild>
        <span
          className="pointer-events-none fixed size-0"
          style={draft ? { left: draft.point.x, top: draft.point.y } : undefined}
        />
      </PopoverAnchor>
      <PopoverContent
        aria-label={label}
        collisionPadding={12}
        className="max-h-[min(70vh,24rem)] overflow-auto"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {draft?.start && draft.end ? (
          <p className="mb-3 font-mono text-xs tabular-nums text-muted-foreground">
            {format(draft.start, 'EEE HH:mm')}–{format(draft.end, 'HH:mm')}
          </p>
        ) : null}
        {choices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No projects yet. Add one in{' '}
            <Link to="/projects" className="underline underline-offset-2">
              Projects
            </Link>
            .
          </p>
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (!draft || !projectId) return
              onSave({
                mode: draft.mode,
                id: draft.entry?.id,
                workspaceId,
                projectId,
                description,
                billable,
                tagIds,
                start: draft.start,
                end: draft.end,
              })
            }}
          >
            {showWorkspace ? (
              <div className="grid gap-1.5">
                <Label htmlFor="entry-workspace">Workspace</Label>
                <select
                  id="entry-workspace"
                  className={controlClass}
                  value={workspaceId}
                  onChange={(event) => {
                    setWorkspaceId(event.target.value)
                    setProjectId('')
                  }}
                >
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor="entry-project">Project</Label>
              <select
                id="entry-project"
                className={controlClass}
                value={projectId}
                required
                onChange={(event) => {
                  const next = event.target.value
                  setProjectId(next)
                  const project = choices.find((item) => item.id === next)
                  if (project) setBillable(project.billable)
                }}
              >
                <option value="">Select</option>
                {choices.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="entry-description">Description</Label>
              <Input id="entry-description" value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
            <div className="flex h-9 items-center gap-2">
              <Switch id="entry-billable" checked={billable} onCheckedChange={setBillable} />
              <Label htmlFor="entry-billable">Billable</Label>
            </div>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {tags
                  .filter((tag) => tag.workspace_id === workspaceId)
                  .map((tag) => {
                    const on = tagIds.includes(tag.id)
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        aria-pressed={on}
                        className={cn(
                          'h-8 border px-2 text-sm',
                          on ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                        )}
                        onClick={() =>
                          setTagIds((current) => (on ? current.filter((id) => id !== tag.id) : [...current, tag.id]))
                        }
                      >
                        {tag.name}
                      </button>
                    )
                  })}
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              {draft?.mode === 'edit' && draft.entry && onDelete ? (
                <Button type="button" variant="destructive" disabled={pending} onClick={() => onDelete(draft.entry!.id)}>
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" disabled={pending || !projectId}>
                {draft?.mode === 'start' ? 'Start' : 'Save'}
              </Button>
            </div>
          </form>
        )}
      </PopoverContent>
    </Popover>
  )
}

export type { Draft, Point }
export { EntryEditor }
