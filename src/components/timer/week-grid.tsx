import { MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from '@heroicons/react/24/outline'
import { format, isToday, startOfDay } from 'date-fns'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDuration } from '@/lib/splits'
import type { Client, ProjectClient, TimeEntry } from '@/types'

import { useTimerGridZoom } from './use-timer-grid-zoom'
import { DAY_MS, DEFAULT_HOUR_PX, dayBounds, heightFor, hourPxFor, inkOn, labelPxFor, layoutDay, snap, topFor } from './week-layout'

type Draft = { day: number; startY: number; endY: number }
type Preview = { id: string; start: number; end: number }

function clientNames(entry: TimeEntry, clients: Client[], projectClients: ProjectClient[]) {
  const saved = (entry.time_entry_clients ?? [])
    .map((row) => clients.find((client) => client.id === row.client_id)?.name)
    .filter((name): name is string => Boolean(name))
  if (saved.length > 0 || !entry.project_id) return saved
  const links = projectClients.filter((row) => row.project_id === entry.project_id)
  const auto = links.length > 0 && links.some((row) => row.split_percent != null)
  if (!auto) return saved
  return links
    .map((row) => clients.find((client) => client.id === row.client_id)?.name)
    .filter((name): name is string => Boolean(name))
}

function projectClientLabel(entry: TimeEntry, clients: Client[], projectClients: ProjectClient[]) {
  const project = entry.project?.name ?? ''
  const names = clientNames(entry, clients, projectClients).join(', ')
  if (project && names) return `${project} · ${names}`
  return project || names
}

function entryLabel(entry: TimeEntry, clients: Client[], projectClients: ProjectClient[]) {
  const description = entry.description.trim()
  if (description) return description
  return projectClientLabel(entry, clients, projectClients)
}

function WeekGrid({
  days,
  entries,
  now,
  focusNowAt = 0,
  clients,
  projectClients,
  onCreate,
  onMove,
  onEdit,
  onDescribe,
}: {
  days: Date[]
  entries: TimeEntry[]
  now: number
  focusNowAt?: number
  clients: Client[]
  projectClients: ProjectClient[]
  onCreate: (start: Date, end: Date, point: { x: number; y: number }) => void
  onMove: (id: string, start: Date, end: Date) => void
  onEdit: (entry: TimeEntry, point: { x: number; y: number }) => void
  onDescribe: (id: string, description: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const { zoom, canZoomOut, canZoomIn, canReset, zoomOut, zoomIn, reset } = useTimerGridZoom()
  const hourPx = hourPxFor(zoom)
  const labelPx = labelPxFor(zoom)
  const hourPxRef = useRef(hourPx)
  const alignedNowAt = useRef(0)
  const nowRef = useRef(now)
  nowRef.current = now
  const [draft, setDraft] = useState<Draft | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const gesture = useRef<{
    kind: 'create' | 'move' | 'resize'
    id?: string
    day: number
    originStart: number
    originEnd: number
    pointerY: number
    moved: boolean
    startY: number
    endY: number
  } | null>(null)

  useEffect(() => {
    const node = scroller.current
    if (!node) return
    const previous = hourPxRef.current
    if (previous !== hourPx) {
      node.scrollTop = (node.scrollTop / previous) * hourPx
      hourPxRef.current = hourPx
      return
    }
    hourPxRef.current = hourPx
    if (focusNowAt > 0 && focusNowAt !== alignedNowAt.current) return
    node.scrollTop = 7 * hourPx
  }, [days[0]?.toISOString(), days.length, hourPx, focusNowAt])

  useEffect(() => {
    if (focusNowAt === 0) return
    alignedNowAt.current = focusNowAt
    const frame = requestAnimationFrame(() => {
      const node = scroller.current
      if (!node) return
      const hours = node.querySelector<HTMLElement>('.week-hours')
      const offset = hours?.offsetTop ?? 0
      const px = hourPxRef.current
      const y = topFor(nowRef.current, new Date(nowRef.current), px)
      const max = Math.max(0, node.scrollHeight - node.clientHeight)
      node.scrollTop = Math.min(max, Math.max(0, offset + y - node.clientHeight / 2))
    })
    return () => cancelAnimationFrame(frame)
  }, [focusNowAt])

  useEffect(() => {
    function move(event: PointerEvent) {
      const active = gesture.current
      if (!active) return
      const px = hourPxRef.current
      const delta = snap(((event.clientY - active.pointerY) / px) * 60 * 60 * 1000)
      if (Math.abs(event.clientY - active.pointerY) > 3) active.moved = true
      if (active.kind === 'create') {
        const column = columnAt(event)
        const day = column ? Number(column.dataset.day) : active.day
        const y = column ? event.clientY - column.getBoundingClientRect().top : active.endY
        active.day = day
        active.endY = y
        setDraft({ day, startY: active.startY, endY: y })
        return
      }
      const hovered = columnAt(event)
      const shift = hovered ? Number(hovered.dataset.day) - active.day : 0
      if (active.kind === 'resize') {
        setPreview({
          id: active.id!,
          start: active.originStart,
          end: Math.max(active.originStart + 15 * 60 * 1000, active.originEnd + delta),
        })
        return
      }
      setPreview({
        id: active.id!,
        start: active.originStart + delta + shift,
        end: active.originEnd + delta + shift,
      })
    }
    function up(event: PointerEvent) {
      const active = gesture.current
      gesture.current = null
      if (!active) return
      if (active.kind === 'create') {
        const column = columnAt(event)
        const day = column ? Number(column.dataset.day) : active.day
        const y = column ? event.clientY - column.getBoundingClientRect().top : active.endY
        const start = yToTime(day, Math.min(active.startY, y), hourPxRef.current)
        const end = yToTime(day, Math.max(active.startY, y), hourPxRef.current)
        setDraft(null)
        if (end.getTime() - start.getTime() >= 15 * 60 * 1000) {
          onCreate(start, end, { x: event.clientX, y: event.clientY })
        }
        return
      }
      const entry = entries.find((item) => item.id === active.id)
      setPreview(null)
      if (!entry) return
      if (!active.moved) {
        onEdit(entry, { x: event.clientX, y: event.clientY })
        return
      }
      const delta = snap(((event.clientY - active.pointerY) / hourPxRef.current) * 60 * 60 * 1000)
      if (active.kind === 'resize') {
        const end = Math.max(active.originStart + 15 * 60 * 1000, active.originEnd + delta)
        onMove(entry.id, new Date(active.originStart), new Date(end))
        return
      }
      const hovered = columnAt(event)
      const shift = hovered ? Number(hovered.dataset.day) - active.day : 0
      onMove(entry.id, new Date(active.originStart + delta + shift), new Date(active.originEnd + delta + shift))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [entries, onCreate, onEdit, onMove])

  const dayView = days.length === 1

  const shown = entries.map((entry) => {
    if (!preview || preview.id !== entry.id || entry.stopped_at == null) return entry
    return {
      ...entry,
      started_at: new Date(preview.start).toISOString(),
      stopped_at: new Date(preview.end).toISOString(),
    }
  })

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
    <TooltipProvider delayDuration={1000} skipDelayDuration={0} disableHoverableContent>
    <div ref={scroller} className="min-h-0 flex-1 overflow-auto border-y border-border">
      <div className="grid" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="sticky top-0 z-30 border-b border-border bg-background" />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className="sticky top-0 z-30 border-b border-l border-border bg-background px-2 py-2"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className={isToday(day) ? 'text-sm text-primary' : 'text-sm'}>
                {format(day, 'EEE')} <span className="font-mono tabular-nums">{format(day, 'd')}</span>
              </span>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {formatDuration(dayTotal(shown, day, now))}
              </span>
            </div>
          </div>
        ))}
        <div className="relative" style={{ height: 24 * hourPx }}>
          {Array.from({ length: 24 }, (_, hour) => (
            <span
              key={hour}
              className="absolute right-1.5 font-mono text-[10px] tabular-nums text-muted-foreground"
              style={{ top: hour * hourPx + 4 }}
            >
              {String(hour).padStart(2, '0')}
            </span>
          ))}
        </div>
        {days.map((day) => {
          const key = startOfDay(day).getTime()
          return (
            <div
              key={key}
              data-day={key}
              className="week-hours relative border-l border-border"
              style={{ height: 24 * hourPx }}
              onPointerDown={(event) => {
                if (event.button !== 0) return
                if ((event.target as HTMLElement).closest('[data-entry]')) return
                const y = event.clientY - event.currentTarget.getBoundingClientRect().top
                gesture.current = {
                  kind: 'create',
                  day: key,
                  originStart: y,
                  originEnd: y,
                  pointerY: event.clientY,
                  moved: false,
                  startY: y,
                  endY: y,
                }
                setDraft({ day: key, startY: y, endY: y })
              }}
            >
              {isToday(day) ? (
                <div className="pointer-events-none absolute inset-x-0 z-20 h-px bg-primary" style={{ top: topFor(now, day, hourPx) }}>
                  <span className="absolute -left-px -top-[3px] size-1.5 bg-primary" />
                </div>
              ) : null}
              {draft?.day === key ? (
                <div
                  className="absolute inset-x-1 border border-primary bg-primary/15"
                  style={{
                    top: Math.min(draft.startY, draft.endY),
                    height: Math.max(Math.abs(draft.endY - draft.startY), 8),
                  }}
                />
              ) : null}
              {layoutDay(shown, day, now).map((slice) => {
                const running = slice.entry.stopped_at == null
                const color = slice.entry.project?.color || '#5E5C57'
                const label = entryLabel(slice.entry, clients, projectClients)
                return (
                  <Tooltip key={slice.entry.id}>
                    <TooltipTrigger asChild>
                  <div
                    data-entry={slice.entry.id}
                    role="button"
                    tabIndex={0}
                    className={
                      dayView
                        ? 'absolute z-10 overflow-hidden px-1.5 text-left transition-[filter] duration-75 hover:brightness-90'
                        : 'absolute z-10 overflow-hidden px-1.5 py-1 text-left transition-[filter] duration-75 hover:brightness-90'
                    }
                    style={{
                      top: topFor(slice.start, day, hourPx),
                      height: heightFor(slice.start, slice.end, hourPx),
                      left: `calc(${(slice.lane / slice.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / slice.lanes}% - 4px)`,
                      background: running ? `color-mix(in srgb, ${color} var(--running-fill), transparent)` : color,
                      color: inkOn(color),
                      borderRadius: 4,
                      border: running ? `2px dotted ${color}` : undefined,
                      cursor: running ? 'default' : 'grab',
                    }}
                    onPointerDown={(event) => {
                      if (running || event.button !== 0) return
                      event.stopPropagation()
                      gesture.current = {
                        kind: 'move',
                        id: slice.entry.id,
                        day: key,
                        originStart: new Date(slice.entry.started_at).getTime(),
                        originEnd: new Date(slice.entry.stopped_at!).getTime(),
                        pointerY: event.clientY,
                        moved: false,
                        startY: 0,
                        endY: 0,
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onEdit(slice.entry, {
                          x: event.currentTarget.getBoundingClientRect().left,
                          y: event.currentTarget.getBoundingClientRect().bottom,
                        })
                      }
                    }}
                  >
                    {dayView ? (
                      <div className="flex h-full items-center gap-2">
                        <DescriptionField
                          value={slice.entry.description}
                          placeholder={projectClientLabel(slice.entry, clients, projectClients)}
                          fontSize={labelPx}
                          onSave={(description) => onDescribe(slice.entry.id, description)}
                        />
                        <p className="shrink-0 font-mono text-[10px] tabular-nums leading-tight">
                          {formatDuration(Math.round((slice.end - slice.start) / 1000))}
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="truncate font-medium leading-tight" style={{ fontSize: labelPx }}>
                          {entryLabel(slice.entry, clients, projectClients)}
                        </p>
                        {slice.end - slice.start > 20 * 60 * 1000 ? (
                          <p className="font-mono text-[10px] tabular-nums leading-tight">
                            {formatDuration(Math.round((slice.end - slice.start) / 1000))}
                          </p>
                        ) : null}
                      </>
                    )}
                    {running ? null : (
                      <span
                        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                        onPointerDown={(event) => {
                          event.stopPropagation()
                          gesture.current = {
                            kind: 'resize',
                            id: slice.entry.id,
                            day: key,
                            originStart: new Date(slice.entry.started_at).getTime(),
                            originEnd: new Date(slice.entry.stopped_at!).getTime(),
                            pointerY: event.clientY,
                            moved: false,
                            startY: 0,
                            endY: 0,
                          }
                        }}
                      />
                    )}
                  </div>
                    </TooltipTrigger>
                    {label ? <TooltipContent>{label}</TooltipContent> : null}
                  </Tooltip>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
    </TooltipProvider>
    <TooltipProvider delayDuration={0} skipDelayDuration={0} disableHoverableContent>
      <div className="absolute bottom-3 right-3 z-40 flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Zoom out"
              disabled={!canZoomOut}
              onClick={zoomOut}
            >
              <MagnifyingGlassMinusIcon aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom out</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Reset zoom"
              disabled={!canReset}
              onClick={reset}
            >
              Reset
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reset zoom</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Zoom in"
              disabled={!canZoomIn}
              onClick={zoomIn}
            >
              <MagnifyingGlassPlusIcon aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom in</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
    </div>
  )
}

function DescriptionField({
  value,
  placeholder,
  fontSize,
  onSave,
}: {
  value: string
  placeholder: string
  fontSize: number
  onSave: (description: string) => void
}) {
  return (
    <input
      key={value}
      aria-label="Description"
      data-hover="wash"
      defaultValue={value}
      placeholder={placeholder || 'Description'}
      style={{ fontSize }}
      className="min-w-0 flex-1 rounded-[2px] bg-transparent px-1 leading-tight outline-none transition-colors duration-75 hover:bg-[color-mix(in_srgb,black_8%,transparent)] placeholder:text-current placeholder:opacity-60"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      onBlur={(event) => {
        if (event.target.value !== value) onSave(event.target.value)
      }}
    />
  )
}

function columnAt(event: PointerEvent) {
  const node = document.elementFromPoint(event.clientX, event.clientY)
  return node?.closest<HTMLElement>('[data-day]') ?? null
}

function yToTime(day: number, y: number, hourPx = DEFAULT_HOUR_PX) {
  const minutes = snap((y / hourPx) * 60 * 60 * 1000)
  return new Date(day + Math.min(Math.max(minutes, 0), DAY_MS - 15 * 60 * 1000))
}

function dayTotal(entries: TimeEntry[], day: Date, now: number) {
  const bounds = dayBounds(day)
  return entries.reduce((sum, entry) => {
    const start = new Date(entry.started_at).getTime()
    const end = entry.stopped_at ? new Date(entry.stopped_at).getTime() : now
    return sum + Math.max(0, Math.round((Math.min(end, bounds.end) - Math.max(start, bounds.start)) / 1000))
  }, 0)
}

export { WeekGrid }
