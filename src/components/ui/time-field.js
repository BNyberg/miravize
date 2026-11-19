import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
function TimeField({ value, onChange, 'aria-label': ariaLabel, }) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(value || '00:00');
    const [hour, minute] = (value || '00:00').split(':');
    const hourRef = useRef(null);
    const minuteRef = useRef(null);
    const inputRef = useRef(null);
    useEffect(() => {
        setDraft(value || '00:00');
    }, [value]);
    useEffect(() => {
        if (!open)
            return;
        hourRef.current?.scrollIntoView({ block: 'center' });
        minuteRef.current?.scrollIntoView({ block: 'center' });
    }, [open, hour, minute]);
    function pick(nextHour, nextMinute) {
        onChange(`${nextHour}:${nextMinute}`);
    }
    function commitDraft(raw) {
        const digits = raw.replace(/\D/g, '').slice(0, 4);
        if (digits.length < 3) {
            setDraft(value || '00:00');
            return;
        }
        const nextHour = digits.slice(0, 2).padStart(2, '0');
        const nextMinute = digits.slice(2).padEnd(2, '0');
        const hourNum = Number(nextHour);
        const minuteNum = Number(nextMinute);
        if (hourNum > 23 || minuteNum > 59) {
            setDraft(value || '00:00');
            return;
        }
        pick(nextHour, nextMinute);
    }
    return (_jsxs(Popover, { open: open, onOpenChange: setOpen, children: [_jsx(PopoverAnchor, { asChild: true, children: _jsx("input", { ref: inputRef, "aria-label": ariaLabel, inputMode: "numeric", className: "h-full w-[7ch] bg-transparent text-center font-mono text-xs tabular-nums outline-none transition-colors duration-75 hover:bg-muted", value: draft, onFocus: () => setOpen(true), onChange: (event) => {
                        const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
                        const next = digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
                        setDraft(next);
                        if (digits.length === 4)
                            commitDraft(digits);
                    }, onBlur: (event) => {
                        const next = event.relatedTarget;
                        if (next instanceof Element && next.closest('[data-radix-popper-content-wrapper]'))
                            return;
                        commitDraft(draft);
                        setOpen(false);
                    }, onKeyDown: (event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            commitDraft(draft);
                            setOpen(false);
                        }
                        if (event.key === 'Escape') {
                            setDraft(value || '00:00');
                            setOpen(false);
                        }
                    } }) }), _jsx(PopoverContent, { className: "w-auto p-1", onOpenAutoFocus: (event) => event.preventDefault(), onCloseAutoFocus: (event) => event.preventDefault(), onInteractOutside: (event) => {
                    if (event.target instanceof Element && inputRef.current?.contains(event.target))
                        event.preventDefault();
                }, children: _jsxs("div", { className: "flex gap-1", children: [_jsx(Column, { label: "Hour", options: HOURS, selected: hour, selectedRef: hourRef, onSelect: (next) => pick(next, minute || '00') }), _jsx(Column, { label: "Minute", options: MINUTES, selected: minute, selectedRef: minuteRef, onSelect: (next) => pick(hour || '00', next) })] }) })] }));
}
function Column({ label, options, selected, selectedRef, onSelect, }) {
    return (_jsxs("div", { className: "w-12", children: [_jsx("p", { className: "px-1 py-1 text-center text-[11px] text-muted-foreground", children: label }), _jsx("div", { className: "max-h-48 overflow-y-auto", children: options.map((option) => {
                    const active = option === selected;
                    return (_jsx("button", { ref: active ? selectedRef : undefined, type: "button", className: cn('flex h-7 w-full items-center justify-center rounded-md font-mono text-xs tabular-nums', active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'), onClick: () => onSelect(option), children: option }, option));
                }) })] }));
}
export { TimeField };
