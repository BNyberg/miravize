import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { Check } from '@phosphor-icons/react'
import * as SelectPrimitive from '@radix-ui/react-select'
import * as React from 'react'

import { filterMenuNodes, MenuFilterField } from '@/lib/menu-filter'
import { cn } from '@/lib/utils'

const Select = SelectPrimitive.Root
const SelectValue = SelectPrimitive.Value
const SelectGroup = SelectPrimitive.Group

function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background py-1 pl-3 pr-2.5 text-left text-sm transition-colors duration-75 hover:bg-muted data-[state=open]:bg-muted disabled:cursor-not-allowed disabled:opacity-50 [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate [&>span]:text-left',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = 'popper',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  const [query, setQuery] = React.useState('')
  const filtered = filterMenuNodes(children, query, {
    item: SelectItem,
    group: SelectGroup,
  })
  const empty = query.trim() !== '' && filtered.itemCount === 0

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        sideOffset={6}
        className={cn(
          'relative z-50 flex max-h-72 min-w-[var(--radix-select-trigger-width)] flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground',
          className,
        )}
        {...props}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          props.onOpenAutoFocus?.(event)
        }}
      >
        <MenuFilterField value={query} onChange={setQuery} />
        <SelectPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto p-1">
          {empty ? (
            <SelectItem value="__no-matches" disabled>
              No matches
            </SelectItem>
          ) : (
            filtered.children
          )}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-3 pr-8 text-left text-sm outline-none transition-colors duration-75 hover:bg-muted focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="absolute right-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4" aria-hidden="true" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  )
}

export { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue }
