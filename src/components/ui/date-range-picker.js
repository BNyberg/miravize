import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isWithinInterval, startOfMonth, startOfWeek, subMonths, subWeeks, } from 'date-fns';
import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
const WEEK = { weekStartsOn: 1 };
function parseDay(value) {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day)
        return new Date();
    return new Date(year, month - 1, day);
}
function dayKey(date) {
    return format(date, 'yyyy-MM-dd');
}
function presetRanges(today) {
    const thisWeekStart = startOfWeek(today, WEEK);
    const lastWeekStart = subWeeks(thisWeekStart, 1);
    const lastMonth = subMonths(today, 1);
    return [
        { label: 'Today', from: today, to: today },
        { label: 'Last week', from: lastWeekStart, to: endOfWeek(lastWeekStart, WEEK) },
        { label: 'This week', from: thisWeekStart, to: endOfWeek(today, WEEK) },
        { label: 'Last month', from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) },
        { label: 'This month', from: startOfMonth(today), to: endOfMonth(today) },
    ];
}
function matchingPreset(from, to, today) {
    return presetRanges(today).find((preset) => dayKey(preset.from) === from && dayKey(preset.to) === to);
}
function rangeLabel(from, to) {
    if (from === to)
        return from;
    return `${from} – ${to}`;
}
function DateRangePicker({ from, to, onChange, id, }) {
    const today = new Date();
    const [open, setOpen] = useState(false);
    const [draftFrom, setDraftFrom] = useState(from);
    const [draftTo, setDraftTo] = useState(to);
    const [picking, setPicking] = useState('start');
    const [month, setMonth] = useState(() => startOfMonth(parseDay(from)));
    const gridStart = startOfWeek(startOfMonth(month), WEEK);
    const gridEnd = endOfWeek(endOfMonth(month), WEEK);
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
    const weeks = [];
    for (let index = 0; index < days.length; index += 7)
        weeks.push(days.slice(index, index + 7));
    const start = parseDay(draftFrom);
    const end = parseDay(draftTo);
    const rangeStart = start < end ? start : end;
    const rangeEnd = start < end ? end : start;
    const activePreset = matchingPreset(draftFrom, draftTo, today)?.label;
    function openWith(next) {
        setOpen(next);
        if (!next)
            return;
        setDraftFrom(from);
        setDraftTo(to);
        setPicking('start');
        setMonth(startOfMonth(parseDay(from)));
    }
    function commit(nextFrom, nextTo) {
        onChange({ from: nextFrom, to: nextTo });
        setOpen(false);
    }
    function pickDay(day) {
        const key = dayKey(day);
        if (picking === 'start') {
            setDraftFrom(key);
            setDraftTo(key);
            setPicking('end');
            return;
        }
        if (day < start)
            commit(key, dayKey(start));
        else
            commit(dayKey(start), key);
    }
    return (_jsxs(Popover, { open: open, onOpenChange: openWith, children: [_jsx(PopoverTrigger, { asChild: true, children: _jsx("button", { id: id, type: "button", "aria-label": "Date range", className: "inline-flex h-9 w-full items-center justify-start rounded-md border border-input bg-background px-2.5 text-left font-mono text-xs tabular-nums transition-colors duration-75 hover:bg-muted", children: rangeLabel(from, to) }) }), _jsx(PopoverContent, { className: "w-auto p-4", children: _jsxs("div", { className: "flex gap-6", children: [_jsxs("div", { className: "flex w-28 shrink-0 flex-col", children: [_jsx("div", { className: "flex flex-col", children: presetRanges(today).map((preset) => (_jsx("button", { type: "button", className: cn('rounded-md px-2 py-2 text-left text-sm hover:bg-muted', activePreset === preset.label ? 'font-medium text-primary' : 'text-foreground'), onClick: () => commit(dayKey(preset.from), dayKey(preset.to)), children: preset.label }, preset.label))) }), _jsx("button", { type: "button", className: "mt-auto px-2 py-2 text-left text-sm font-medium text-primary", onClick: () => commit(dayKey(startOfMonth(today)), dayKey(endOfMonth(today))), children: "Reset" })] }), _jsxs("div", { children: [_jsxs("div", { className: "mb-3 flex items-center justify-between gap-6", children: [_jsx("p", { className: "text-sm font-semibold", children: format(month, 'MMMM yyyy') }), _jsxs("div", { className: "flex items-center", children: [_jsx("button", { type: "button", className: "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground", "aria-label": "Previous month", onClick: () => setMonth((current) => addMonths(current, -1)), children: _jsx(ChevronLeftIcon, { className: "size-4" }) }), _jsx("button", { type: "button", className: "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground", "aria-label": "Next month", onClick: () => setMonth((current) => addMonths(current, 1)), children: _jsx(ChevronRightIcon, { className: "size-4" }) })] })] }), _jsx("div", { className: "grid grid-cols-7 text-center", children: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((label) => (_jsx("span", { className: "pb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground", children: label }, label))) }), _jsx("div", { className: "flex flex-col", children: weeks.map((week) => (_jsx("div", { className: "grid grid-cols-7", children: week.map((day) => {
                                            const inMonth = isSameMonth(day, month);
                                            const isStart = isSameDay(day, rangeStart);
                                            const isEnd = isSameDay(day, rangeEnd);
                                            const single = isSameDay(rangeStart, rangeEnd);
                                            const inside = isWithinInterval(day, { start: rangeStart, end: rangeEnd });
                                            return (_jsxs("div", { className: "relative flex h-9 items-center justify-center", children: [inside && !single && (_jsx("span", { className: cn('absolute inset-y-1 bg-primary/15', isStart && 'left-1/2 right-0', isEnd && 'left-0 right-1/2', !isStart && !isEnd && 'inset-x-0') })), _jsx("button", { type: "button", className: cn('relative z-10 flex size-8 items-center justify-center rounded-md text-sm tabular-nums', (isStart || isEnd) && 'bg-primary text-primary-foreground', !inMonth && !(isStart || isEnd) && 'text-muted-foreground/45', !(isStart || isEnd) && !inside && 'hover:bg-muted', !(isStart || isEnd) && isSameDay(day, today) && 'ring-1 ring-border'), onClick: () => pickDay(day), children: format(day, 'd') })] }, dayKey(day)));
                                        }) }, dayKey(week[0])))) })] })] }) })] }));
}
export { DateRangePicker };
