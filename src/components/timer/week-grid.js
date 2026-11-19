import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from '@heroicons/react/24/outline';
import { format, isToday, startOfDay } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDuration } from '@/lib/splits';
import { useTimerGridZoom } from './use-timer-grid-zoom';
import { DAY_MS, DEFAULT_HOUR_PX, dayBounds, heightFor, hourPxFor, inkOn, labelPxFor, layoutDay, snap, topFor } from './week-layout';
function clientNames(entry, clients, projectClients) {
    const saved = (entry.time_entry_clients ?? [])
        .map((row) => clients.find((client) => client.id === row.client_id)?.name)
        .filter((name) => Boolean(name));
    if (saved.length > 0 || !entry.project_id)
        return saved;
    const links = projectClients.filter((row) => row.project_id === entry.project_id);
    const auto = links.length > 0 && links.some((row) => row.split_percent != null);
    if (!auto)
        return saved;
    return links
        .map((row) => clients.find((client) => client.id === row.client_id)?.name)
        .filter((name) => Boolean(name));
}
function projectClientLabel(entry, clients, projectClients) {
    const project = entry.project?.name ?? '';
    const names = clientNames(entry, clients, projectClients).join(', ');
    if (project && names)
        return `${project} · ${names}`;
    return project || names;
}
function entryLabel(entry, clients, projectClients) {
    const description = entry.description.trim();
    if (description)
        return description;
    return projectClientLabel(entry, clients, projectClients);
}
function WeekGrid({ days, entries, now, focusNowAt = 0, clients, projectClients, onCreate, onMove, onEdit, onDescribe, }) {
    const scroller = useRef(null);
    const { zoom, canZoomOut, canZoomIn, canReset, zoomOut, zoomIn, reset } = useTimerGridZoom();
    const hourPx = hourPxFor(zoom);
    const labelPx = labelPxFor(zoom);
    const hourPxRef = useRef(hourPx);
    const alignedNowAt = useRef(0);
    const nowRef = useRef(now);
    nowRef.current = now;
    const [draft, setDraft] = useState(null);
    const [preview, setPreview] = useState(null);
    const gesture = useRef(null);
    function scrollToNow(node) {
        const hours = node.querySelector('.week-hours');
        const offset = hours?.offsetTop ?? 0;
        const y = topFor(nowRef.current, new Date(nowRef.current), hourPxRef.current);
        const max = Math.max(0, node.scrollHeight - node.clientHeight);
        node.scrollTop = Math.min(max, Math.max(0, offset + y - node.clientHeight / 2));
    }
    useEffect(() => {
        const node = scroller.current;
        if (!node)
            return;
        const previous = hourPxRef.current;
        if (previous !== hourPx) {
            node.scrollTop = (node.scrollTop / previous) * hourPx;
            hourPxRef.current = hourPx;
            return;
        }
        hourPxRef.current = hourPx;
        if (focusNowAt > 0 && focusNowAt !== alignedNowAt.current)
            return;
        scrollToNow(node);
    }, [days[0]?.toISOString(), days.length, hourPx, focusNowAt]);
    useEffect(() => {
        if (focusNowAt === 0)
            return;
        alignedNowAt.current = focusNowAt;
        const frame = requestAnimationFrame(() => {
            const node = scroller.current;
            if (!node)
                return;
            scrollToNow(node);
        });
        return () => cancelAnimationFrame(frame);
    }, [focusNowAt]);
    useEffect(() => {
        function move(event) {
            const active = gesture.current;
            if (!active)
                return;
            const px = hourPxRef.current;
            const delta = snap(((event.clientY - active.pointerY) / px) * 60 * 60 * 1000);
            if (Math.abs(event.clientY - active.pointerY) > 3)
                active.moved = true;
            if (active.kind === 'create') {
                const column = columnAt(event);
                const day = column ? Number(column.dataset.day) : active.day;
                const y = column ? event.clientY - column.getBoundingClientRect().top : active.endY;
                active.day = day;
                active.endY = y;
                setDraft({ day, startY: active.startY, endY: y });
                return;
            }
            const hovered = columnAt(event);
            const shift = hovered ? Number(hovered.dataset.day) - active.day : 0;
            if (active.kind === 'resize') {
                setPreview({
                    id: active.id,
                    start: active.originStart,
                    end: Math.max(active.originStart + 15 * 60 * 1000, active.originEnd + delta),
                });
                return;
            }
            setPreview({
                id: active.id,
                start: active.originStart + delta + shift,
                end: active.originEnd + delta + shift,
            });
        }
        function up(event) {
            const active = gesture.current;
            gesture.current = null;
            if (!active)
                return;
            if (active.kind === 'create') {
                const column = columnAt(event);
                const day = column ? Number(column.dataset.day) : active.day;
                const y = column ? event.clientY - column.getBoundingClientRect().top : active.endY;
                const start = yToTime(day, Math.min(active.startY, y), hourPxRef.current);
                const end = yToTime(day, Math.max(active.startY, y), hourPxRef.current);
                setDraft(null);
                if (end.getTime() - start.getTime() >= 15 * 60 * 1000) {
                    onCreate(start, end, { x: event.clientX, y: event.clientY });
                }
                return;
            }
            const entry = entries.find((item) => item.id === active.id);
            setPreview(null);
            if (!entry)
                return;
            if (!active.moved) {
                onEdit(entry, { x: event.clientX, y: event.clientY });
                return;
            }
            const delta = snap(((event.clientY - active.pointerY) / hourPxRef.current) * 60 * 60 * 1000);
            if (active.kind === 'resize') {
                const end = Math.max(active.originStart + 15 * 60 * 1000, active.originEnd + delta);
                onMove(entry.id, new Date(active.originStart), new Date(end));
                return;
            }
            const hovered = columnAt(event);
            const shift = hovered ? Number(hovered.dataset.day) - active.day : 0;
            onMove(entry.id, new Date(active.originStart + delta + shift), new Date(active.originEnd + delta + shift));
        }
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
    }, [entries, onCreate, onEdit, onMove]);
    const dayView = days.length === 1;
    const shown = entries.map((entry) => {
        if (!preview || preview.id !== entry.id || entry.stopped_at == null)
            return entry;
        return {
            ...entry,
            started_at: new Date(preview.start).toISOString(),
            stopped_at: new Date(preview.end).toISOString(),
        };
    });
    return (_jsxs("div", { className: "relative flex min-h-0 flex-1 flex-col", children: [_jsx(TooltipProvider, { delayDuration: 1000, skipDelayDuration: 0, disableHoverableContent: true, children: _jsx("div", { ref: scroller, className: "min-h-0 flex-1 overflow-auto border-y border-border", children: _jsxs("div", { className: "grid", style: { gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }, children: [_jsx("div", { className: "sticky top-0 z-30 border-b border-border bg-background" }), days.map((day) => (_jsx("div", { className: "sticky top-0 z-30 border-b border-l border-border bg-background px-2 py-2", children: _jsxs("div", { className: "flex items-baseline justify-between gap-2", children: [_jsxs("span", { className: isToday(day) ? 'text-sm text-primary' : 'text-sm', children: [format(day, 'EEE'), " ", _jsx("span", { className: "font-mono tabular-nums", children: format(day, 'd') })] }), _jsx("span", { className: "font-mono text-[11px] tabular-nums text-muted-foreground", children: formatDuration(dayTotal(shown, day, now)) })] }) }, day.toISOString()))), _jsx("div", { className: "relative", style: { height: 24 * hourPx }, children: Array.from({ length: 24 }, (_, hour) => (_jsx("span", { className: "absolute right-1.5 font-mono text-[10px] tabular-nums text-muted-foreground", style: { top: hour * hourPx + 4 }, children: String(hour).padStart(2, '0') }, hour))) }), days.map((day) => {
                                const key = startOfDay(day).getTime();
                                return (_jsxs("div", { "data-day": key, className: "week-hours relative border-l border-border", style: { height: 24 * hourPx }, onPointerDown: (event) => {
                                        if (event.button !== 0)
                                            return;
                                        if (event.target.closest('[data-entry]'))
                                            return;
                                        const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
                                        gesture.current = {
                                            kind: 'create',
                                            day: key,
                                            originStart: y,
                                            originEnd: y,
                                            pointerY: event.clientY,
                                            moved: false,
                                            startY: y,
                                            endY: y,
                                        };
                                        setDraft({ day: key, startY: y, endY: y });
                                    }, children: [isToday(day) ? (_jsx("div", { className: "pointer-events-none absolute inset-x-0 z-20 h-px bg-primary", style: { top: topFor(now, day, hourPx) }, children: _jsx("span", { className: "absolute -left-px -top-[3px] size-1.5 bg-primary" }) })) : null, draft?.day === key ? (_jsx("div", { className: "absolute inset-x-1 border border-primary bg-primary/15", style: {
                                                top: Math.min(draft.startY, draft.endY),
                                                height: Math.max(Math.abs(draft.endY - draft.startY), 8),
                                            } })) : null, layoutDay(shown, day, now).map((slice) => {
                                            const running = slice.entry.stopped_at == null;
                                            const color = slice.entry.project?.color || '#5E5C57';
                                            const label = entryLabel(slice.entry, clients, projectClients);
                                            const blockHeight = heightFor(slice.start, slice.end, hourPx);
                                            const inlineDescription = dayView && blockHeight >= 32;
                                            return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsxs("div", { "data-entry": slice.entry.id, role: "button", tabIndex: 0, className: dayView
                                                                ? 'absolute z-10 overflow-hidden px-1.5 text-left transition-[filter] duration-75 hover:brightness-90'
                                                                : 'absolute z-10 overflow-hidden px-1.5 py-1 text-left transition-[filter] duration-75 hover:brightness-90', style: {
                                                                top: topFor(slice.start, day, hourPx),
                                                                height: blockHeight,
                                                                left: `calc(${(slice.lane / slice.lanes) * 100}% + 2px)`,
                                                                width: `calc(${100 / slice.lanes}% - 4px)`,
                                                                background: running ? `color-mix(in srgb, ${color} var(--running-fill), transparent)` : color,
                                                                color: inkOn(color),
                                                                borderRadius: 4,
                                                                border: running ? `2px dotted ${color}` : undefined,
                                                                cursor: running ? 'default' : 'grab',
                                                            }, onPointerDown: (event) => {
                                                                if (running || event.button !== 0)
                                                                    return;
                                                                event.stopPropagation();
                                                                gesture.current = {
                                                                    kind: 'move',
                                                                    id: slice.entry.id,
                                                                    day: key,
                                                                    originStart: new Date(slice.entry.started_at).getTime(),
                                                                    originEnd: new Date(slice.entry.stopped_at).getTime(),
                                                                    pointerY: event.clientY,
                                                                    moved: false,
                                                                    startY: 0,
                                                                    endY: 0,
                                                                };
                                                            }, onKeyDown: (event) => {
                                                                if (event.key === 'Enter' || event.key === ' ') {
                                                                    event.preventDefault();
                                                                    onEdit(slice.entry, {
                                                                        x: event.currentTarget.getBoundingClientRect().left,
                                                                        y: event.currentTarget.getBoundingClientRect().bottom,
                                                                    });
                                                                }
                                                            }, children: [inlineDescription ? (_jsxs("div", { className: "flex h-full items-center gap-2", children: [_jsx(DescriptionField, { value: slice.entry.description, placeholder: projectClientLabel(slice.entry, clients, projectClients), fontSize: labelPx, onSave: (description) => onDescribe(slice.entry.id, description) }), _jsx("p", { className: "shrink-0 font-mono text-[10px] tabular-nums leading-tight", children: formatDuration(Math.round((slice.end - slice.start) / 1000)) })] })) : (_jsxs(_Fragment, { children: [_jsx("p", { className: "truncate font-medium leading-tight", style: { fontSize: labelPx }, children: entryLabel(slice.entry, clients, projectClients) }), slice.end - slice.start > 20 * 60 * 1000 ? (_jsx("p", { className: "font-mono text-[10px] tabular-nums leading-tight", children: formatDuration(Math.round((slice.end - slice.start) / 1000)) })) : null] })), running ? null : (_jsx("span", { className: "absolute inset-x-0 bottom-0 h-2 cursor-ns-resize", onPointerDown: (event) => {
                                                                        event.stopPropagation();
                                                                        gesture.current = {
                                                                            kind: 'resize',
                                                                            id: slice.entry.id,
                                                                            day: key,
                                                                            originStart: new Date(slice.entry.started_at).getTime(),
                                                                            originEnd: new Date(slice.entry.stopped_at).getTime(),
                                                                            pointerY: event.clientY,
                                                                            moved: false,
                                                                            startY: 0,
                                                                            endY: 0,
                                                                        };
                                                                    } }))] }) }), label ? _jsx(TooltipContent, { children: label }) : null] }, slice.entry.id));
                                        })] }, key));
                            })] }) }) }), _jsx(TooltipProvider, { delayDuration: 0, skipDelayDuration: 0, disableHoverableContent: true, children: _jsxs("div", { className: "absolute bottom-3 right-3 z-40 flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5", children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { type: "button", variant: "ghost", size: "icon", className: "size-8", "aria-label": "Zoom out", disabled: !canZoomOut, onClick: zoomOut, children: _jsx(MagnifyingGlassMinusIcon, { "aria-hidden": "true" }) }) }), _jsx(TooltipContent, { children: "Zoom out" })] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { type: "button", variant: "ghost", size: "sm", "aria-label": "Reset zoom", disabled: !canReset, onClick: reset, children: "Reset" }) }), _jsx(TooltipContent, { children: "Reset zoom" })] }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Button, { type: "button", variant: "ghost", size: "icon", className: "size-8", "aria-label": "Zoom in", disabled: !canZoomIn, onClick: zoomIn, children: _jsx(MagnifyingGlassPlusIcon, { "aria-hidden": "true" }) }) }), _jsx(TooltipContent, { children: "Zoom in" })] })] }) })] }));
}
function DescriptionField({ value, placeholder, fontSize, onSave, }) {
    return (_jsx("input", { "aria-label": "Description", "data-hover": "wash", defaultValue: value, placeholder: placeholder || 'Description', style: { fontSize }, className: "min-w-0 flex-1 rounded-[2px] bg-transparent px-1 leading-tight outline-none transition-colors duration-75 hover:bg-[color-mix(in_srgb,black_8%,transparent)] placeholder:text-current placeholder:opacity-60", onPointerDown: (event) => event.stopPropagation(), onKeyDown: (event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
            }
        }, onBlur: (event) => {
            if (event.target.value !== value)
                onSave(event.target.value);
        } }, value));
}
function columnAt(event) {
    const node = document.elementFromPoint(event.clientX, event.clientY);
    return node?.closest('[data-day]') ?? null;
}
function yToTime(day, y, hourPx = DEFAULT_HOUR_PX) {
    const minutes = snap((y / hourPx) * 60 * 60 * 1000);
    return new Date(day + Math.min(Math.max(minutes, 0), DAY_MS - 15 * 60 * 1000));
}
function dayTotal(entries, day, now) {
    const bounds = dayBounds(day);
    return entries.reduce((sum, entry) => {
        const start = new Date(entry.started_at).getTime();
        const end = entry.stopped_at ? new Date(entry.stopped_at).getTime() : now;
        return sum + Math.max(0, Math.round((Math.min(end, bounds.end) - Math.max(start, bounds.start)) / 1000));
    }, 0);
}
export { WeekGrid };
