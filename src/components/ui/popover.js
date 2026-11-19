import { jsx as _jsx } from "react/jsx-runtime";
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';
import { cn } from '@/lib/utils';
const Popover = PopoverPrimitive.Root;
const PopoverAnchor = PopoverPrimitive.Anchor;
const PopoverTrigger = PopoverPrimitive.Trigger;
function PopoverContent({ className, align = 'start', sideOffset = 6, ...props }) {
    return (_jsx(PopoverPrimitive.Portal, { children: _jsx(PopoverPrimitive.Content, { align: align, sideOffset: sideOffset, className: cn('z-50 w-[280px] rounded-lg border border-border bg-card p-3 text-card-foreground shadow-sm outline-none', className), ...props }) }));
}
export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
