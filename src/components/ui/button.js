import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';
const buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0", {
    variants: {
        variant: {
            default: 'bg-primary text-primary-foreground hover:brightness-95',
            destructive: 'bg-destructive text-white hover:brightness-95',
            outline: 'border border-border bg-background hover:bg-muted',
            secondary: 'bg-secondary text-secondary-foreground hover:brightness-95',
            ghost: 'hover:bg-muted',
            link: 'text-primary underline-offset-4 hover:underline',
        },
        size: {
            default: 'h-9 px-3',
            sm: 'h-8 rounded-md px-2.5 text-xs',
            lg: 'h-10 rounded-md px-4',
            icon: 'h-9 w-9',
        },
    },
    defaultVariants: {
        variant: 'default',
        size: 'default',
    },
});
function Button({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }) {
    if (asChild) {
        return (_jsx(Slot, { "data-slot": "button", className: cn(buttonVariants({ variant, size, className })), ...props, children: children }));
    }
    return (_jsxs("button", { "data-slot": "button", className: cn(buttonVariants({ variant, size, className })), ...props, disabled: disabled || loading, "aria-busy": loading || undefined, children: [loading ? _jsx(ArrowPathIcon, { className: "animate-spin", "aria-hidden": "true" }) : null, children] }));
}
export { Button, buttonVariants };
