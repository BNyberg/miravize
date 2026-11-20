import { AccountPhoto } from '@/components/account/account-avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { WorkspacePerson } from '@/features/workspaces/use-workspace-people'

function personName(person: WorkspacePerson | undefined) {
  return person?.full_name?.trim() || ''
}

function personLabel(person: WorkspacePerson | undefined) {
  return personName(person) || person?.email || 'Unassigned'
}

export function AssigneeCell({
  assigneeId,
  people,
  onAssign,
}: {
  assigneeId: string | null
  people: WorkspacePerson[]
  onAssign?: (userId: string) => void
}) {
  const person = people.find((item) => item.user_id === assigneeId)
  const label = personLabel(person)
  const interactive = Boolean(onAssign) && people.length > 1
  const square = (size: 'md' | 'sm', email: string | undefined, avatarUrl: string | null | undefined) => (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted',
        size === 'md' ? 'size-8' : 'size-5 text-[10px]',
      )}
    >
      <AccountPhoto email={email} avatarUrl={avatarUrl || undefined} className={size === 'sm' ? 'text-[10px]' : undefined} />
    </span>
  )

  if (!interactive) {
    return (
      <span className="inline-flex" title={label} aria-label={`Assignee ${label}`}>
        {square('md', person?.email, person?.avatar_url)}
      </span>
    )
  }

  const sorted = [...people].sort((a, b) => personLabel(a).localeCompare(personLabel(b)))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted"
          aria-label={`Assignee ${label}`}
          title={label}
        >
          <AccountPhoto email={person?.email} avatarUrl={person?.avatar_url || undefined} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-64">
        {sorted.map((item) => {
          const name = personName(item)
          return (
            <DropdownMenuItem
              key={item.user_id}
              onSelect={() => {
                if (item.user_id !== assigneeId) onAssign?.(item.user_id)
              }}
            >
              {square('sm', item.email, item.avatar_url)}
              <span className={cn('min-w-0 truncate', item.user_id === assigneeId && 'font-medium')}>
                {name || item.email}
              </span>
              {name ? <span className="sr-only">{item.email}</span> : null}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
