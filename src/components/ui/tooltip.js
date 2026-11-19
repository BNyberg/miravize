import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';
import { cn } from '@/lib/utils';
function TooltipProvider({ delayDuration = 200, ...props }) {
    return _jsx(TooltipPrimitive.Provider, { delayDuration: delayDuration, ...props });
}
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
function TooltipContent({ className, sideOffset = 6, children, ...props }) {
    return (_jsx(TooltipPrimitive.Portal, { children: _jsxs(TooltipPrimitive.Content, { sideOffset: sideOffset, className: cn('z-50 max-w-xs rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm', className), ...props, children: [children, _jsx(TooltipPrimitive.Arrow, { className: "fill-card" })] }) }));
}
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
