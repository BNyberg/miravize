import { jsx as _jsx } from "react/jsx-runtime";
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as React from 'react';
import { cn } from '@/lib/utils';
function Switch({ className, ...props }) {
    return (_jsx(SwitchPrimitive.Root, { className: cn('peer relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-150 before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[""] data-[state=checked]:bg-primary data-[state=unchecked]:bg-input disabled:cursor-not-allowed disabled:opacity-50', className), ...props, children: _jsx(SwitchPrimitive.Thumb, { className: "pointer-events-none block h-4 w-4 rounded-full bg-background transition-transform duration-150 data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" }) }));
}
export { Switch };
