import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { CheckIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState } from 'react';
let items = [];
const listeners = new Set();
function emit() {
    for (const listener of listeners)
        listener(items);
}
function dismiss(id) {
    items = items.filter((item) => item.id !== id);
    emit();
}
function toast(input) {
    const item = { id: crypto.randomUUID(), ...input };
    items = [...items, item];
    emit();
    window.setTimeout(() => dismiss(item.id), 4000);
}
const icons = {
    success: CheckIcon,
    error: XMarkIcon,
    info: InformationCircleIcon,
};
const toneClass = {
    success: 'border-primary',
    error: 'border-destructive',
    info: 'border-border',
};
const iconClass = {
    success: 'text-primary',
    error: 'text-destructive',
    info: 'text-muted-foreground',
};
function ToastCard({ item }) {
    const Icon = icons[item.tone];
    const startX = useRef(null);
    const [offset, setOffset] = useState(0);
    return (_jsx("div", { role: "status", className: `w-80 rounded-lg border bg-card p-3 shadow-sm ${toneClass[item.tone]}`, style: { transform: `translateX(${offset}px)`, opacity: offset > 40 ? 1 - (offset - 40) / 120 : 1 }, onPointerDown: (event) => {
            startX.current = event.clientX;
        }, onPointerMove: (event) => {
            if (startX.current == null)
                return;
            setOffset(Math.max(0, event.clientX - startX.current));
        }, onPointerUp: () => {
            if (offset > 80)
                dismiss(item.id);
            else
                setOffset(0);
            startX.current = null;
        }, onPointerLeave: () => {
            if (startX.current == null)
                return;
            if (offset > 80)
                dismiss(item.id);
            else
                setOffset(0);
            startX.current = null;
        }, children: _jsxs("div", { className: "flex items-start gap-2", children: [_jsx(Icon, { className: `mt-0.5 size-4 shrink-0 ${iconClass[item.tone]}`, "aria-hidden": "true" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex items-start gap-2", children: [_jsx("p", { className: "min-w-0 flex-1 text-sm font-medium", children: item.title }), _jsx("button", { type: "button", className: "shrink-0 text-muted-foreground", "aria-label": "Dismiss", onClick: () => dismiss(item.id), children: _jsx(XMarkIcon, { className: "size-4", "aria-hidden": "true" }) })] }), item.description ? _jsx("p", { className: "mt-0.5 text-sm text-muted-foreground", children: item.description }) : null] })] }) }));
}
function ToastHost() {
    const [list, setList] = useState(items);
    useEffect(() => {
        listeners.add(setList);
        return () => {
            listeners.delete(setList);
        };
    }, []);
    if (list.length === 0)
        return null;
    return (_jsx("div", { className: "pointer-events-none fixed right-4 top-4 z-[100] flex flex-col gap-2", children: list.map((item) => (_jsx("div", { className: "pointer-events-auto", children: _jsx(ToastCard, { item: item }) }, item.id))) }));
}
export { toast, ToastHost };
