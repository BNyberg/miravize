import { CheckIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useEffect, useRef, useState } from 'react'

type Tone = 'success' | 'error' | 'info'

type ToastItem = {
  id: string
  tone: Tone
  title: string
  description?: string
}

let items: ToastItem[] = []
const listeners = new Set<(next: ToastItem[]) => void>()

function emit() {
  for (const listener of listeners) listener(items)
}

function dismiss(id: string) {
  items = items.filter((item) => item.id !== id)
  emit()
}

function toast(input: { tone: Tone; title: string; description?: string }) {
  const item: ToastItem = { id: crypto.randomUUID(), ...input }
  items = [...items, item]
  emit()
  if (input.tone !== 'error') {
    window.setTimeout(() => dismiss(item.id), 4000)
  }
}

const icons = {
  success: CheckIcon,
  error: XMarkIcon,
  info: InformationCircleIcon,
}

function ToastCard({ item }: { item: ToastItem }) {
  const Icon = icons[item.tone]
  const startX = useRef<number | null>(null)
  const [offset, setOffset] = useState(0)

  return (
    <div
      role="status"
      className="w-80 rounded-lg border border-border bg-card p-3 shadow-sm"
      style={{ transform: `translateX(${offset}px)`, opacity: offset > 40 ? 1 - (offset - 40) / 120 : 1 }}
      onPointerDown={(event) => {
        startX.current = event.clientX
      }}
      onPointerMove={(event) => {
        if (startX.current == null) return
        setOffset(Math.max(0, event.clientX - startX.current))
      }}
      onPointerUp={() => {
        if (offset > 80) dismiss(item.id)
        else setOffset(0)
        startX.current = null
      }}
      onPointerLeave={() => {
        if (startX.current == null) return
        if (offset > 80) dismiss(item.id)
        else setOffset(0)
        startX.current = null
      }}
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-sm font-medium">{item.title}</p>
            <button type="button" className="shrink-0 text-muted-foreground" aria-label="Dismiss" onClick={() => dismiss(item.id)}>
              <XMarkIcon className="size-4" aria-hidden="true" />
            </button>
          </div>
          {item.description ? <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p> : null}
        </div>
      </div>
    </div>
  )
}

function ToastHost() {
  const [list, setList] = useState(items)
  useEffect(() => {
    listeners.add(setList)
    return () => {
      listeners.delete(setList)
    }
  }, [])
  if (list.length === 0) return null
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex flex-col gap-2">
      {list.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <ToastCard item={item} />
        </div>
      ))}
    </div>
  )
}

export { toast, ToastHost }
