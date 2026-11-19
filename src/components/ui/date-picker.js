import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { addMonths, eachDayOfInterval, endOfMonth, format, isSameDay, startOfMonth } from 'date-fns';
import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
function parseDay(value) {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day)
        return new Date();
    return new Date(year, month - 1, day);
}
function DatePicker({ value, onChange, id, 'aria-label': ariaLabel, size = 'default', }) {
    const selected = value ? parseDay(value) : null;
    const [open, setOpen] = useState(false);
    const [month, setMonth] = useState(() => startOfMonth(selected ?? new Date()));
    const monthStart = startOfMonth(month);
    const leading = (monthStart.getDay() + 6) % 7;
    const days = eachDayOfInterval({ start: monthStart, end: endOfMonth(month) });
    const today = new Date();
    return (_jsxs(Popover, { open: open, onOpenChange: (next) => {
            setOpen(next);
            if (next)
                setMonth(startOfMonth(selected ?? new Date()));
        }, children: [_jsx(PopoverTrigger, { asChild: true, children: _jsx("button", { id: id, type: "button", "aria-label": ariaLabel, "data-slot": "date-trigger", className: cn('inline-flex shrink-0 items-center rounded-md border border-border bg-muted/60 px-2.5 font-mono text-xs tabular-nums transition-colors duration-75 hover:bg-muted data-[state=open]:bg-muted', size === 'sm' ? 'h-8 justify-center' : 'h-9 w-full justify-start text-left border-input bg-background'), children: value || 'Date' }) }), _jsxs(PopoverContent, { className: "w-auto p-4", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between gap-6", children: [_jsx("p", { className: "text-sm font-semibold", children: format(month, 'MMMM yyyy') }), _jsxs("div", { className: "flex items-center", children: [_jsx("button", { type: "button", className: "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground", "aria-label": "Previous month", onClick: () => setMonth((current) => addMonths(current, -1)), children: _jsx(ChevronLeftIcon, { className: "size-4" }) }), _jsx("button", { type: "button", className: "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground", "aria-label": "Next month", onClick: () => setMonth((current) => addMonths(current, 1)), children: _jsx(ChevronRightIcon, { className: "size-4" }) })] })] }), _jsxs("div", { className: "grid grid-cols-7 gap-1 text-center", children: [['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((label) => (_jsx("span", { className: "pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground", children: label }, label))), Array.from({ length: leading }, (_, index) => (_jsx("span", {}, `pad-${index}`))), days.map((day) => {
                                const chosen = selected ? isSameDay(day, selected) : false;
                                return (_jsx("button", { type: "button", className: cn('size-9 rounded-md text-sm tabular-nums', chosen ? 'bg-primary text-primary-foreground' : 'hover:bg-muted', !chosen && isSameDay(day, today) && 'border border-border'), onClick: () => {
                                        onChange(format(day, 'yyyy-MM-dd'));
                                        setOpen(false);
                                    }, children: format(day, 'd') }, day.toISOString()));
                            })] })] })] }));
}
export { DatePicker };
