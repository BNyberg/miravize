import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ArrowPathIcon, PlayIcon, StopCircleIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
export function RowTrackButton({ active, starting, stopping, canStart, blockedLabel, onStart, onStop, }) {
    const busy = starting || stopping;
    const label = active ? 'Stop tracking' : canStart ? 'Log and track' : blockedLabel || 'Choose a project first';
    return (_jsx(TooltipProvider, { children: _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { children: _jsx(Button, { type: "button", variant: "outline", size: "icon", className: "size-8", "aria-label": active ? 'Stop tracking' : 'Log and track', disabled: busy || (!active && !canStart), onClick: active ? onStop : onStart, children: busy ? (_jsx(ArrowPathIcon, { className: "animate-spin", "aria-hidden": "true" })) : active ? (_jsx(StopCircleIcon, { "aria-hidden": "true", className: "[&_path:last-child]:fill-destructive [&_path:last-child]:stroke-destructive" })) : (_jsx(PlayIcon, { "aria-hidden": "true" })) }) }) }), _jsx(TooltipContent, { children: label })] }) }));
}
