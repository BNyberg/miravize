import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as React from 'react';
import { filterMenuNodes, MenuFilterField } from '@/lib/menu-filter';
import { cn } from '@/lib/utils';
const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
function DropdownMenuContent({ className, sideOffset = 4, children, filter = true, ...props }) {
    const [query, setQuery] = React.useState('');
    const filtered = filterMenuNodes(children, query, {
        item: DropdownMenuItem,
        group: DropdownMenuGroup,
        label: DropdownMenuLabel,
        separator: DropdownMenuSeparator,
    });
    const empty = query.trim() !== '' && filtered.itemCount === 0;
    return (_jsx(DropdownMenuPrimitive.Portal, { children: _jsxs(DropdownMenuPrimitive.Content, { sideOffset: sideOffset, className: cn(filter
                ? 'z-50 flex max-h-72 min-w-40 flex-col overflow-hidden rounded-lg border border-border bg-popover p-0 text-popover-foreground'
                : 'z-50 min-w-40 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground', className), ...props, onOpenAutoFocus: (event) => {
                if (filter)
                    event.preventDefault();
                props.onOpenAutoFocus?.(event);
            }, children: [filter ? _jsx(MenuFilterField, { value: query, onChange: setQuery }) : null, filter ? (_jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto p-1", children: [empty ? _jsx(DropdownMenuItem, { disabled: true, children: "No matches" }) : null, filtered.children] })) : (children)] }) }));
}
function DropdownMenuItem({ className, ...props }) {
    return (_jsx(DropdownMenuPrimitive.Item, { className: cn('relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors duration-75 hover:bg-muted focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className), ...props }));
}
function DropdownMenuSeparator({ className, ...props }) {
    return (_jsx(DropdownMenuPrimitive.Separator, { className: cn('-mx-1 my-1 h-px bg-border', className), ...props }));
}
function DropdownMenuLabel({ className, ...props }) {
    return (_jsx(DropdownMenuPrimitive.Label, { className: cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', className), ...props }));
}
export { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, };
