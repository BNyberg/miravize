import { useLayoutEffect, useRef, type KeyboardEvent } from 'react'

import { cn } from '@/lib/utils'
import type { NoteChip, NotePart, RequestCatalog } from '@/lib/request-assignment'

export type MentionCaret = { node: Text; start: number; query: string }

function mergeParts(parts: NotePart[]): NotePart[] {
  const next: NotePart[] = []
  for (const part of parts) {
    if (part.type === 'text' && next.at(-1)?.type === 'text') {
      const last = next.at(-1) as { type: 'text'; text: string }
      last.text += part.text
    } else {
      next.push(part.type === 'text' ? { type: 'text', text: part.text } : { type: 'chip', chip: part.chip })
    }
  }
  return next
}

export function readNoteParts(root: HTMLElement): NotePart[] {
  const parts: NotePart[] = []
  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (text) parts.push({ type: 'text', text })
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    if (el.dataset.chipKind && el.dataset.chipId) {
      parts.push({
        type: 'chip',
        chip: { kind: el.dataset.chipKind as NoteChip['kind'], id: el.dataset.chipId },
      })
      return
    }
    if (el.tagName === 'BR') {
      parts.push({ type: 'text', text: '\n' })
      return
    }
    el.childNodes.forEach(walk)
  }
  walk(root)
  return mergeParts(parts)
}

export function mentionQueryInEditor(root: HTMLElement): MentionCaret | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const node = sel.anchorNode
  if (!node || !root.contains(node) || node.nodeType !== Node.TEXT_NODE) return null
  const text = node.textContent ?? ''
  const offset = sel.anchorOffset
  const before = text.slice(0, offset)
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  const query = before.slice(at + 1)
  if (/\s/.test(query)) return null
  return { node: node as Text, start: at, query }
}

function chipAfterCollapsedCaret(root: HTMLElement): HTMLElement | null {
  const sel = window.getSelection()
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return null
  const node = sel.anchorNode
  if (!node || !root.contains(node)) return null
  if (node.nodeType === Node.TEXT_NODE && sel.anchorOffset === 0) {
    let current: Node | null = node
    while (current && current !== root) {
      const prev: ChildNode | null = current.previousSibling
      if (prev) {
        if (prev.nodeType === Node.ELEMENT_NODE) {
          const el = prev as HTMLElement
          if (el.dataset.chipKind) return el
        }
        if (prev.nodeType === Node.TEXT_NODE && (prev.textContent ?? '') === '') {
          current = prev
          continue
        }
        break
      }
      current = current.parentNode
    }
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement
    const child = el.childNodes[sel.anchorOffset - 1]
    if (child?.nodeType === Node.ELEMENT_NODE) {
      const prev = child as HTMLElement
      if (prev.dataset.chipKind) return prev
    }
  }
  return null
}

function chipLabel(chip: NoteChip, catalog: RequestCatalog) {
  if (chip.kind === 'project') return catalog.projects.find((row) => row.id === chip.id)?.name ?? 'Project'
  if (chip.kind === 'activity') return catalog.activities.find((row) => row.id === chip.id)?.name ?? 'Activity'
  return catalog.clients.find((row) => row.id === chip.id)?.name ?? 'Client'
}

export function mentionBadgeEl(chip: NoteChip, catalog: RequestCatalog) {
  const wrap = document.createElement('span')
  wrap.contentEditable = 'false'
  wrap.dataset.chipKind = chip.kind
  wrap.dataset.chipId = chip.id
  wrap.className = cn(
    'mx-0.5 inline-flex translate-y-px items-center rounded-md border px-1.5 py-0 align-baseline text-xs font-medium leading-5',
    chip.kind === 'activity' && 'border-transparent bg-secondary text-secondary-foreground',
    chip.kind === 'client' && 'border-border text-foreground',
    chip.kind === 'project' && 'border-transparent text-white',
  )
  if (chip.kind === 'project') {
    wrap.style.background = catalog.projects.find((row) => row.id === chip.id)?.color || '#5E5C57'
  }
  wrap.textContent = chipLabel(chip, catalog)
  return wrap
}

export function writeNoteParts(root: HTMLElement, parts: NotePart[], catalog: RequestCatalog) {
  const frag = document.createDocumentFragment()
  for (const part of parts) {
    if (part.type === 'text') frag.appendChild(document.createTextNode(part.text))
    else frag.appendChild(mentionBadgeEl(part.chip, catalog))
  }
  root.replaceChildren(frag)
}

export function insertChipsAtMention(mention: MentionCaret, chips: NoteChip[], catalog: RequestCatalog) {
  const text = mention.node.textContent ?? ''
  const before = text.slice(0, mention.start)
  const after = text.slice(mention.start + 1 + mention.query.length)
  mention.node.textContent = before
  const parent = mention.node.parentNode
  if (!parent) return
  const insertBefore = before ? mention.node.nextSibling : mention.node
  const frag = document.createDocumentFragment()
  for (const chip of chips) frag.appendChild(mentionBadgeEl(chip, catalog))
  const space = document.createTextNode(`\u00a0${after}`)
  frag.appendChild(space)
  parent.insertBefore(frag, insertBefore)
  if (!before) mention.node.remove()
  const sel = window.getSelection()
  const range = document.createRange()
  range.setStart(space, 1)
  range.collapse(true)
  sel?.removeAllRanges()
  sel?.addRange(range)
}

export function NoteField({
  placeholder,
  className,
  onParts,
  onMention,
  onReady,
  onKeyDown,
}: {
  placeholder: string
  className?: string
  onParts: (parts: NotePart[]) => void
  onMention: (mention: MentionCaret | null) => void
  onReady: (el: HTMLDivElement | null) => void
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => boolean | void
}) {
  const root = useRef<HTMLDivElement>(null)
  const skip = useRef(false)

  useLayoutEffect(() => {
    onReady(root.current)
  }, [onReady])

  function emit() {
    if (!root.current) return
    onParts(readNoteParts(root.current))
    onMention(mentionQueryInEditor(root.current))
  }

  return (
    <div
      ref={root}
      role="textbox"
      aria-label="Notes and mentions"
      aria-multiline="true"
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      className={cn(
        'min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 transition-colors duration-75 hover:bg-muted focus:outline-none',
        'empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]',
        className,
      )}
      onInput={() => {
        if (skip.current) return
        emit()
      }}
      onKeyUp={() => onMention(root.current ? mentionQueryInEditor(root.current) : null)}
      onClick={() => onMention(root.current ? mentionQueryInEditor(root.current) : null)}
      onPaste={(event) => {
        event.preventDefault()
        const text = event.clipboardData.getData('text/plain')
        document.execCommand('insertText', false, text)
      }}
      onKeyDown={(event) => {
        if (onKeyDown?.(event)) {
          event.preventDefault()
          return
        }
        if (event.key === 'Backspace' && root.current) {
          const chipEl = chipAfterCollapsedCaret(root.current)
          if (chipEl) {
            event.preventDefault()
            skip.current = true
            chipEl.remove()
            skip.current = false
            emit()
          }
        }
      }}
    />
  )
}
