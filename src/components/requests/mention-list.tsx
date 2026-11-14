import { useEffect, useRef } from 'react'

import type { MentionHit } from '@/lib/request-assignment'
import { cn } from '@/lib/utils'

const sections = [
  { kind: 'project', label: 'Projects' },
  { kind: 'activity', label: 'Activities' },
  { kind: 'client', label: 'Clients' },
] as const

export function MentionList({
  choices,
  active,
  onHover,
  onPick,
}: {
  choices: MentionHit[]
  active: number
  onHover: (index: number) => void
  onPick: (item: MentionHit) => void
}) {
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const groups = sections
    .map((section) => ({
      ...section,
      rows: choices.flatMap((item, index) => (item.kind === section.kind ? [{ item, index }] : [])),
    }))
    .filter((group) => group.rows.length > 0)

  return groups.map((group, groupIndex) => (
    <div key={group.kind}>
      {groupIndex > 0 ? <div className="-mx-1 my-1 h-px bg-border" role="separator" /> : null}
      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{group.label}</div>
      {group.rows.map(({ item, index }) => (
        <button
          key={`${item.kind}-${item.id}-${item.token}`}
          ref={index === active ? activeRef : undefined}
          type="button"
          className={cn(
            'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-muted',
            index === active && 'bg-muted',
          )}
          onMouseEnter={() => onHover(index)}
          onMouseDown={(event) => {
            event.preventDefault()
            onPick(item)
          }}
        >
          {item.kind === 'client' ? null : (
            <span className="size-2 shrink-0" style={{ background: item.color || '#5E5C57' }} aria-hidden="true" />
          )}
          <span className="min-w-0 truncate">{item.label}</span>
        </button>
      ))}
    </div>
  ))
}
