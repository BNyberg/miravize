import { jsx as _jsx } from "react/jsx-runtime";
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from '@phosphor-icons/react';
import * as React from 'react';
import { cn } from '@/lib/utils';
function Checkbox({ className, ...props }) {
    return (_jsx(CheckboxPrimitive.Root, { className: cn('peer size-4 shrink-0 rounded-sm border border-input data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground', className), ...props, children: _jsx(CheckboxPrimitive.Indicator, { className: "flex items-center justify-center text-current", children: _jsx(Check, { className: "size-3", "aria-hidden": "true" }) }) }));
}
export { Checkbox };
