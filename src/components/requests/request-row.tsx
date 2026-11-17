import { XMarkIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'

import {
  applyActivity,
  applyProject,
  assignmentClientMode,
  displayClientIds,
  type RequestAssignment,
  type RequestCatalog,
} from '@/lib/request-assignment'
import { RowTrackButton } from '@/components/timer/row-track-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  TableSelect,
  TableSelectContent,
  TableSelectItem,
  TableSelectTrigger,
  TableSelectValue,
} from '@/components/ui/table-select'
import { TableCell, TableRow } from '@/components/ui/table'
import { requestCode } from '@/lib/request-code'
import { cn } from '@/lib/utils'
import type { SupportRequest, TaskStatus } from '@/types'

const NONE = '__none__'

const STATUS_CLASS: Record<TaskStatus, string> = {
  todo: 'text-destructive',
  doing: 'text-amber-800 dark:text-amber-300',
  done: '',
}

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'Todo' },
  { value: 'doing', label: 'Doing' },
  { value: 'done', label: 'Done' },
]

export type RequestPatch = {
  id: string
  requester: string
  request: string
  status: TaskStatus
  projectId: string
  activityId: string
  clientIds: string[]
  notes: string | null
}

function CellText({
  value,
  label,
  required,
  className,
  onSave,
}: {
  value: string
  label: string
  required?: boolean
  className?: string
  onSave: (value: string) => void
}) {
  return (
    <input
      key={value}
      aria-label={label}
      defaultValue={value}
      className={cn(
        'w-full rounded-md bg-transparent px-1 py-1 outline-none transition-colors duration-75 hover:bg-muted',
        className,
      )}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      onBlur={(event) => {
        const next = event.currentTarget.value
        if (required) {
          if (!next.trim()) {
            event.currentTarget.value = value
            return
          }
          if (next.trim() === value.trim()) return
          onSave(next.trim())
          return
        }
        if (next.trim() === value.trim()) return
        onSave(next)
      }}
    />
  )
}

export function RequestLedgerRow({
  row,
  catalog,
  workspaceName,
  showWorkspace,
  onPatch,
  tracking,
  active,
  stopping,
  onTrack,
  onStop,
  deleting,
  onDelete,
}: {
  row: SupportRequest
  catalog: RequestCatalog
  workspaceName?: string
  showWorkspace: boolean
  onPatch: (next: RequestPatch) => void
  tracking: boolean
  active: boolean
  stopping: boolean
  onTrack: () => void
  onStop: () => void
  deleting: boolean
  onDelete: () => void
}) {
  const assignment: RequestAssignment = {
    projectId: row.project_id ?? '',
    activityId: row.activity_id ?? '',
    clientIds: displayClientIds(row, catalog),
  }
  const mode = assignmentClientMode(catalog, assignment.projectId)
  const projects = catalog.projects.filter((project) => project.workspace_id === row.workspace_id)
  const activities = assignment.projectId
    ? catalog.activities.filter((activity) => activity.project_id === assignment.projectId)
    : catalog.activities.filter((activity) => activity.workspace_id === row.workspace_id)
  const linked = catalog.projectClients
    .filter((link) => link.project_id === assignment.projectId)
    .map((link) => catalog.clients.find((client) => client.id === link.client_id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  const uniqueClients = [...new Map(linked.map((item) => [item.id, item])).values()]
  const [confirmDelete, setConfirmDelete] = useState(false)
  const clientNames = assignment.clientIds
    .map((id) => catalog.clients.find((client) => client.id === id)?.name)
    .filter(Boolean)
    .join(', ')

  function persist(next: RequestAssignment, extra?: Partial<RequestPatch>) {
    onPatch({
      id: row.id,
      requester: extra?.requester ?? row.requester,
      request: extra?.request ?? row.request,
      status: extra?.status ?? row.status,
      projectId: extra?.projectId ?? next.projectId,
      activityId: extra?.activityId ?? next.activityId,
      clientIds: extra?.clientIds ?? next.clientIds,
      notes: extra?.notes === undefined ? row.additional_notes : extra.notes,
    })
  }

  const done = row.status === 'done'

  return (
    <TableRow className={cn(done && 'text-muted-foreground')}>
      <TableCell className="whitespace-nowrap tabular">{requestCode(row.task_number)}</TableCell>
      {showWorkspace ? <TableCell className="min-w-[10rem]">{workspaceName}</TableCell> : null}
      <TableCell className="whitespace-nowrap">{row.logged_on}</TableCell>
      <TableCell className="w-32 min-w-32 max-w-32">
        <CellText
          value={row.requester}
          label="Requester"
          required
          className={cn('min-w-0', done && 'line-through')}
          onSave={(requester) => persist(assignment, { requester })}
        />
      </TableCell>
      <TableCell className="min-w-[28rem]">
        <CellText
          value={row.request}
          label="Request"
          required
          className={cn('min-w-0', done && 'line-through')}
          onSave={(request) => persist(assignment, { request })}
        />
      </TableCell>
      <TableCell className="min-w-[8rem]">
        <TableSelect value={row.status} onValueChange={(value) => persist(assignment, { status: value as TaskStatus })}>
          <TableSelectTrigger aria-label="Status" className={STATUS_CLASS[row.status]}>
            <TableSelectValue />
          </TableSelectTrigger>
          <TableSelectContent>
            {STATUSES.map((status) => (
              <TableSelectItem key={status.value} value={status.value} className={STATUS_CLASS[status.value]}>
                {status.label}
              </TableSelectItem>
            ))}
          </TableSelectContent>
        </TableSelect>
      </TableCell>
      <TableCell className="min-w-[12rem]">
        <TableSelect
          value={assignment.projectId || NONE}
          onValueChange={(value) => persist(applyProject(assignment, value === NONE ? '' : value, catalog))}
        >
          <TableSelectTrigger aria-label="Project">
            <TableSelectValue />
          </TableSelectTrigger>
          <TableSelectContent>
            <TableSelectItem value={NONE}>No project</TableSelectItem>
            {projects.map((project) => (
              <TableSelectItem key={project.id} value={project.id}>
                <span className="flex items-center gap-2">
                  <span className="size-2 shrink-0 rounded-sm" style={{ background: project.color }} aria-hidden="true" />
                  {project.name}
                </span>
              </TableSelectItem>
            ))}
          </TableSelectContent>
        </TableSelect>
      </TableCell>
      <TableCell className="min-w-[12rem]">
        <TableSelect
          value={assignment.activityId || NONE}
          onValueChange={(value) =>
            persist(value === NONE ? { ...assignment, activityId: '' } : applyActivity(assignment, value, catalog))
          }
        >
          <TableSelectTrigger aria-label="Activity">
            <TableSelectValue />
          </TableSelectTrigger>
          <TableSelectContent>
            <TableSelectItem value={NONE}>No activity</TableSelectItem>
            {activities.map((activity) => (
              <TableSelectItem key={activity.id} value={activity.id}>
                {activity.name}
                {activity.client_id
                  ? ` · ${catalog.clients.find((client) => client.id === activity.client_id)?.name ?? ''}`
                  : ''}
              </TableSelectItem>
            ))}
          </TableSelectContent>
        </TableSelect>
      </TableCell>
      <TableCell className="min-w-[12rem]">
        {mode === 'auto' ? (
          <TableSelect value="split" disabled>
            <TableSelectTrigger aria-label="Client">
              <TableSelectValue>{clientNames || 'Split clients'}</TableSelectValue>
            </TableSelectTrigger>
            <TableSelectContent>
              <TableSelectItem value="split">{clientNames || 'Split clients'}</TableSelectItem>
            </TableSelectContent>
          </TableSelect>
        ) : (
          <TableSelect
            value={assignment.clientIds.length === 1 ? assignment.clientIds[0] : assignment.clientIds.length === 0 ? NONE : 'multi'}
            onValueChange={(value) => {
              if (value === 'multi') return
              persist({ ...assignment, clientIds: value === NONE ? [] : [value] })
            }}
          >
            <TableSelectTrigger aria-label="Client" className={cn(uniqueClients.length === 0 && !assignment.projectId && 'opacity-70')}>
              <TableSelectValue>
                {assignment.clientIds.length > 1 ? clientNames : undefined}
              </TableSelectValue>
            </TableSelectTrigger>
            <TableSelectContent>
              <TableSelectItem value={NONE}>No client</TableSelectItem>
              {assignment.clientIds.length > 1 ? <TableSelectItem value="multi">{clientNames}</TableSelectItem> : null}
              {uniqueClients.map((client) => (
                <TableSelectItem key={client.id} value={client.id}>
                  {client.name}
                </TableSelectItem>
              ))}
            </TableSelectContent>
          </TableSelect>
        )}
      </TableCell>
      <TableCell className="min-w-[16rem]">
        <CellText
          value={row.additional_notes ?? ''}
          label="Notes"
          onSave={(notes) => persist(assignment, { notes: notes.trim() || null })}
        />
      </TableCell>
      <TableCell className="sticky right-0 z-10 w-20 border-l border-border bg-card">
        <div className="flex items-center gap-1">
          <RowTrackButton
            active={active}
            starting={tracking}
            stopping={stopping}
            canStart={Boolean(row.project_id) && row.status !== 'done'}
            blockedLabel={
              row.status === 'done' ? 'This request is done. Change its status to work on it again.' : undefined
            }
            onStart={onTrack}
            onStop={onStop}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={`Delete ${row.request}`}
            disabled={deleting}
            onClick={() => setConfirmDelete(true)}
          >
            <XMarkIcon aria-hidden="true" />
          </Button>
        </div>
        <Dialog open={confirmDelete} onOpenChange={(open) => !deleting && setConfirmDelete(open)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-bold text-destructive">Delete {row.request}?</DialogTitle>
              <DialogDescription>This removes the request. Linked time entries stay, without this request.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                loading={deleting}
                onClick={() => {
                  onDelete()
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  )
}
