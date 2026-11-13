import { ChevronDownIcon } from '@heroicons/react/24/outline'
import * as SelectPrimitive from '@radix-ui/react-select'
import * as React from 'react'

import { Select, SelectContent, SelectGroup, SelectItem, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const TableSelect = Select
const TableSelectContent = SelectContent
const TableSelectGroup = SelectGroup
const TableSelectItem = SelectItem
const TableSelectValue = SelectValue

function TableSelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="table-select-trigger"
      className={cn(
        'flex h-8 w-full items-center justify-between gap-2 rounded-md border-0 bg-transparent px-1 text-left text-sm text-inherit transition-colors duration-75 hover:bg-muted data-[state=open]:bg-muted disabled:cursor-not-allowed disabled:opacity-50 [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate [&>span]:text-left',
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

export {
  TableSelect,
  TableSelectContent,
  TableSelectGroup,
  TableSelectItem,
  TableSelectTrigger,
  TableSelectValue,
}
