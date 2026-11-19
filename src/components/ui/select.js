import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { Check } from '@phosphor-icons/react';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as React from 'react';
import { filterMenuNodes, MenuFilterField } from '@/lib/menu-filter';
import { cn } from '@/lib/utils';
const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;
const SelectGroup = SelectPrimitive.Group;
function SelectTrigger({ className, children, ...props }) {
    return (_jsxs(SelectPrimitive.Trigger, { "data-slot": "select-trigger", className: cn('flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background py-1 pl-3 pr-2.5 text-left text-sm transition-colors duration-75 hover:bg-muted data-[state=open]:bg-muted disabled:cursor-not-allowed disabled:opacity-50 [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate [&>span]:text-left', className), ...props, children: [children, _jsx(SelectPrimitive.Icon, { asChild: true, children: _jsx(ChevronDownIcon, { className: "size-4 shrink-0 text-muted-foreground", "aria-hidden": "true" }) })] }));
}
function SelectContent({ className, children, position = 'popper', ...props }) {
    const [query, setQuery] = React.useState('');
    const filtered = filterMenuNodes(children, query, {
        item: SelectItem,
        group: SelectGroup,
    });
    const empty = query.trim() !== '' && filtered.itemCount === 0;
    return (_jsx(SelectPrimitive.Portal, { children: _jsxs(SelectPrimitive.Content, { position: position, sideOffset: 6, className: cn('relative z-50 flex max-h-72 min-w-[var(--radix-select-trigger-width)] flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground', className), ...props, onOpenAutoFocus: (event) => {
                event.preventDefault();
                props.onOpenAutoFocus?.(event);
            }, children: [_jsx(MenuFilterField, { value: query, onChange: setQuery }), _jsxs(SelectPrimitive.Viewport, { className: "min-h-0 flex-1 overflow-y-auto p-1", children: [empty ? (_jsx(SelectItem, { value: "__no-matches", disabled: true, children: "No matches" })) : null, filtered.children] })] }) }));
}
function SelectItem({ className, children, leading, ...props }) {
    return (_jsxs(SelectPrimitive.Item, { className: cn('relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-3 pr-8 text-left text-sm outline-none transition-colors duration-75 hover:bg-muted focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className), ...props, children: [leading ? _jsx("span", { className: "mr-2 flex shrink-0 items-center", children: leading }) : null, _jsx(SelectPrimitive.ItemText, { children: children }), _jsx("span", { className: "absolute right-2 flex size-4 items-center justify-center", children: _jsx(SelectPrimitive.ItemIndicator, { children: _jsx(Check, { className: "size-4", "aria-hidden": "true" }) }) })] }));
}
export { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue };
