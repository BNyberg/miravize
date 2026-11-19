import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
const sections = [
    { kind: 'project', label: 'Projects' },
    { kind: 'activity', label: 'Activities' },
    { kind: 'client', label: 'Clients' },
];
export function MentionList({ choices, active, onHover, onPick, }) {
    const activeRef = useRef(null);
    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: 'nearest' });
    }, [active]);
    const groups = sections
        .map((section) => ({
        ...section,
        rows: choices.flatMap((item, index) => (item.kind === section.kind ? [{ item, index }] : [])),
    }))
        .filter((group) => group.rows.length > 0);
    return groups.map((group, groupIndex) => (_jsxs("div", { children: [groupIndex > 0 ? _jsx("div", { className: "-mx-1 my-1 h-px bg-border", role: "separator" }) : null, _jsx("div", { className: "px-2 py-1.5 text-xs font-medium text-muted-foreground", children: group.label }), group.rows.map(({ item, index }) => (_jsxs("button", { ref: index === active ? activeRef : undefined, type: "button", className: cn('flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-muted', index === active && 'bg-muted'), onMouseEnter: () => onHover(index), onMouseDown: (event) => {
                    event.preventDefault();
                    onPick(item);
                }, children: [item.kind === 'client' ? null : (_jsx("span", { className: "size-2 shrink-0", style: { background: item.color || '#5E5C57' }, "aria-hidden": "true" })), _jsx("span", { className: "min-w-0 truncate", children: item.label })] }, `${item.kind}-${item.id}-${item.token}`)))] }, group.kind)));
}
