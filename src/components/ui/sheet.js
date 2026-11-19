import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from '@phosphor-icons/react';
import * as React from 'react';
import { cn } from '@/lib/utils';
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
function SheetContent({ className, children, side = 'left', ...props }) {
    return (_jsxs(DialogPrimitive.Portal, { children: [_jsx(DialogPrimitive.Overlay, { className: "fixed inset-0 z-50 bg-black/60" }), _jsxs(DialogPrimitive.Content, { className: cn('fixed z-50 flex h-full w-72 flex-col border-border bg-sidebar p-4', side === 'left' ? 'inset-y-0 left-0 border-r' : 'inset-y-0 right-0 border-l', className), ...props, children: [children, _jsxs(DialogPrimitive.Close, { className: "absolute right-3 top-3 opacity-70 hover:opacity-100", children: [_jsx(X, { "aria-hidden": "true" }), _jsx("span", { className: "sr-only", children: "Close" })] })] })] }));
}
export { Sheet, SheetClose, SheetContent, SheetTrigger };
