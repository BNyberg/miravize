import { Children, cloneElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react'

export function collectText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join(' ')
  if (isValidElement<{ children?: ReactNode }>(node)) return collectText(node.props.children)
  return ''
}

export type MenuKinds = {
  item: unknown
  group?: unknown
  label?: unknown
  separator?: unknown
}

function flatten(children: ReactNode): ReactNode[] {
  const out: ReactNode[] = []
  Children.forEach(children, (child) => {
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) {
      out.push(...flatten(child.props.children))
      return
    }
    out.push(child)
  })
  return out
}

function isKind(node: ReactNode, type: unknown) {
  return Boolean(type) && isValidElement(node) && node.type === type
}

function isChrome(node: ReactNode, kinds: MenuKinds) {
  return isKind(node, kinds.label) || isKind(node, kinds.separator)
}

function pruneChrome(nodes: ReactNode[], kinds: MenuKinds) {
  return nodes.filter((node, index) => {
    if (!isChrome(node, kinds)) return true
    return nodes.slice(index + 1).some((next) => isValidElement(next) && !isChrome(next, kinds))
  })
}

export function filterMenuNodes(children: ReactNode, query: string, kinds: MenuKinds): { children: ReactNode; itemCount: number } {
  const q = query.trim().toLowerCase()
  const list = flatten(children)
  if (!q) {
    let itemCount = 0
    for (const child of list) {
      if (isKind(child, kinds.item)) itemCount += 1
      else if (isValidElement<{ children?: ReactNode }>(child)) {
        itemCount += filterMenuNodes(child.props.children, '', kinds).itemCount
      }
    }
    return { children, itemCount }
  }

  const kept: ReactNode[] = []
  let itemCount = 0

  for (const child of list) {
    if (!isValidElement<{ children?: ReactNode }>(child)) {
      if (child != null && child !== false) kept.push(child)
      continue
    }
    if (isKind(child, kinds.item)) {
      if (collectText(child).toLowerCase().includes(q)) {
        kept.push(child)
        itemCount += 1
      }
      continue
    }
    const nested = filterMenuNodes(child.props.children, query, kinds)
    if (isKind(child, kinds.group) || (!isKind(child, kinds.label) && !isKind(child, kinds.separator))) {
      if (nested.itemCount > 0) {
        kept.push(cloneElement(child as ReactElement<{ children?: ReactNode }>, { children: nested.children }))
        itemCount += nested.itemCount
      }
      continue
    }
    kept.push(child)
  }

  return { children: pruneChrome(kept, kinds), itemCount }
}

export function MenuFilterField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="border-b border-border p-1">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Filter"
        aria-label="Filter"
        autoFocus
        className="h-8 w-full rounded-md bg-transparent px-2 text-sm outline-none transition-colors duration-75 hover:bg-muted placeholder:text-muted-foreground"
        onKeyDown={(event) => {
          if (event.key !== 'Escape') event.stopPropagation()
        }}
      />
    </div>
  )
}
