import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from '@phosphor-icons/react';
import * as React from 'react';
import { cn } from '@/lib/utils';
const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;
function DialogOverlay({ className, ...props }) {
    return (_jsx(DialogPrimitive.Overlay, { className: cn('fixed inset-0 z-50 bg-black/60', className), ...props }));
}
function DialogContent({ className, children, ...props }) {
    return (_jsxs(DialogPortal, { children: [_jsx(DialogOverlay, {}), _jsxs(DialogPrimitive.Content, { className: cn('fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-card p-5 duration-150', className), ...props, children: [children, _jsxs(DialogPrimitive.Close, { className: "absolute right-3 top-3 rounded-sm opacity-70 transition-opacity hover:opacity-100", children: [_jsx(X, { "aria-hidden": "true" }), _jsx("span", { className: "sr-only", children: "Close" })] })] })] }));
}
function DialogHeader({ className, ...props }) {
    return _jsx("div", { className: cn('flex flex-col gap-1.5', className), ...props });
}
function DialogTitle({ className, ...props }) {
    return (_jsx(DialogPrimitive.Title, { className: cn('text-lg font-semibold', className), ...props }));
}
function DialogDescription({ className, ...props }) {
    return (_jsx(DialogPrimitive.Description, { className: cn('text-sm text-muted-foreground', className), ...props }));
}
function DialogFooter({ className, ...props }) {
    return _jsx("div", { className: cn('flex justify-end gap-2', className), ...props });
}
export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, };
