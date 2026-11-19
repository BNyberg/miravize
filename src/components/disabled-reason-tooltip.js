import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
export function DisabledReasonTooltip({ reason, children }) {
    const [hovering, setHovering] = useState(false);
    return (_jsxs(Tooltip, { open: Boolean(reason) && hovering, children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { tabIndex: -1, className: "inline-flex", onPointerEnter: () => setHovering(true), onPointerLeave: () => setHovering(false), children: children }) }), reason ? _jsx(TooltipContent, { children: reason }) : null] }));
}
