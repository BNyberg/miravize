import { jsx as _jsx } from "react/jsx-runtime";
import * as React from 'react';
import { cn } from '@/lib/utils';
const controlClass = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground transition-colors duration-75 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50';
function Input({ className, type, ...props }) {
    return (_jsx("input", { type: type, "data-slot": "input", className: cn(controlClass, 'flex py-1 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground', className), ...props }));
}
export { Input, controlClass };
