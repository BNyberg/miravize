import { jsx as _jsx } from "react/jsx-runtime";
import * as React from 'react';
import { cn } from '@/lib/utils';
function Table({ className, ...props }) {
    return (_jsx("div", { className: "relative w-full", children: _jsx("table", { className: cn('w-full caption-bottom text-sm', className), ...props }) }));
}
function TableHeader({ className, ...props }) {
    return _jsx("thead", { className: cn('[&_tr]:border-b', className), ...props });
}
function TableBody({ className, ...props }) {
    return _jsx("tbody", { className: cn('[&_tr:last-child]:border-0', className), ...props });
}
function TableRow({ className, ...props }) {
    return _jsx("tr", { className: cn('border-b border-border transition-colors duration-150', className), ...props });
}
function TableHead({ className, ...props }) {
    return (_jsx("th", { className: cn('h-9 px-3 text-left align-middle text-xs font-medium tracking-[0.06em] text-muted-foreground', className), ...props }));
}
function TableCell({ className, ...props }) {
    return _jsx("td", { className: cn('px-3 py-2 align-middle', className), ...props });
}
export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
