import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useLayoutEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router';
import { SeigaihaPanel } from '@/components/auth/seigaiha-panel';
const formTone = {
    colorScheme: 'light',
    background: '#ffffff',
    color: '#1c1b19',
    '--background': '#ffffff',
    '--foreground': '#1c1b19',
    '--muted': '#f4f3ef',
    '--muted-foreground': '#5e5c57',
    '--border': '#ddd9d2',
    '--input': '#ddd9d2',
    '--primary': '#1f7a4d',
    '--primary-foreground': '#ffffff',
    '--ring': '#1f7a4d',
    '--destructive': '#b42318',
    '--card': '#ffffff',
    '--card-foreground': '#1c1b19',
};
export function AuthShell() {
    const innerRef = useRef(null);
    const [height, setHeight] = useState();
    const [contentHeight, setContentHeight] = useState(0);
    useLayoutEffect(() => {
        const el = innerRef.current;
        if (!el)
            return;
        function apply() {
            const next = el.scrollHeight;
            const max = window.innerHeight - 32;
            setContentHeight(next);
            setHeight(Math.min(next, max));
        }
        apply();
        const observer = new ResizeObserver(apply);
        observer.observe(el);
        window.addEventListener('resize', apply);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', apply);
        };
    }, []);
    return (_jsxs("div", { className: "relative min-h-svh overflow-hidden", children: [_jsx("div", { className: "absolute inset-0", children: _jsx(SeigaihaPanel, {}) }), _jsx("div", { className: "absolute top-1/2 left-4 right-4 z-10 w-auto -translate-y-1/2 rounded-md bg-white shadow-[0_16px_48px_rgba(28,27,25,0.18)] transition-[height] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] sm:left-1/2 sm:right-auto sm:w-[440px] sm:-translate-x-1/2", style: {
                    ...formTone,
                    height,
                    overflowY: height != null && contentHeight > height ? 'auto' : 'hidden',
                }, children: _jsx("div", { ref: innerRef, className: "p-8", children: _jsx(Outlet, {}) }) })] }));
}
