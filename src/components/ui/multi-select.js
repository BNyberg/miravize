import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { Check } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MenuFilterField } from '@/lib/menu-filter';
import { cn } from '@/lib/utils';
function summaryLabel(values, options, allLabel, noun) {
    if (values.length === 0)
        return allLabel;
    if (values.length === 1)
        return options.find((option) => option.value === values[0])?.label ?? values[0];
    return `${values.length} ${noun}`;
}
function OptionRow({ label, leading, checked, onSelect, }) {
    return (_jsxs("button", { type: "button", role: "option", "aria-selected": checked, className: "flex w-full cursor-pointer items-center gap-2 rounded-sm py-1.5 pl-2 pr-2 text-left text-sm outline-none transition-colors duration-75 hover:bg-muted focus:bg-muted", onPointerDown: (event) => {
            event.preventDefault();
            onSelect();
        }, children: [_jsx("span", { "aria-hidden": "true", className: cn('flex size-4 shrink-0 items-center justify-center rounded-sm border border-input', checked && 'border-primary bg-primary text-primary-foreground'), children: checked ? _jsx(Check, { className: "size-3", "aria-hidden": "true" }) : null }), leading ? _jsx("span", { className: "flex shrink-0 items-center", children: leading }) : null, _jsx("span", { className: "min-w-0 flex-1 truncate", children: label })] }));
}
export function MultiSelect({ label, values, onChange, options, allLabel, noun, }) {
    const [query, setQuery] = useState('');
    const selected = useMemo(() => new Set(values), [values]);
    const q = query.trim().toLowerCase();
    const visible = q ? options.filter((option) => option.label.toLowerCase().includes(q)) : options;
    function toggle(value) {
        onChange(selected.has(value) ? values.filter((id) => id !== value) : [...values, value]);
    }
    return (_jsxs(Popover, { onOpenChange: (open) => { if (!open)
            setQuery(''); }, children: [_jsx(PopoverTrigger, { asChild: true, children: _jsxs("button", { type: "button", "aria-label": label, className: "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background py-1 pl-3 pr-2.5 text-left text-sm transition-colors duration-75 hover:bg-muted data-[state=open]:bg-muted", children: [_jsx("span", { className: "min-w-0 flex-1 truncate", children: summaryLabel(values, options, allLabel, noun) }), _jsx(ChevronDownIcon, { className: "size-4 shrink-0 text-muted-foreground", "aria-hidden": "true" })] }) }), _jsx(PopoverContent, { className: "flex max-h-72 w-[var(--radix-popover-trigger-width)] min-w-56 flex-col overflow-hidden bg-popover p-0 text-popover-foreground shadow-none", onOpenAutoFocus: (event) => event.preventDefault(), children: _jsxs("div", { role: "listbox", "aria-multiselectable": "true", "aria-label": label, className: "flex min-h-0 flex-1 flex-col overflow-hidden", children: [_jsx(MenuFilterField, { value: query, onChange: setQuery }), _jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto p-1", children: [q === '' ? _jsx(OptionRow, { label: allLabel, checked: values.length === 0, onSelect: () => onChange([]) }) : null, visible.length === 0 ? (_jsx("p", { className: "px-2 py-1.5 text-sm text-muted-foreground", children: "No matches" })) : (visible.map((option) => (_jsx(OptionRow, { label: option.label, leading: option.leading, checked: selected.has(option.value), onSelect: () => toggle(option.value) }, option.value))))] })] }) })] }));
}
