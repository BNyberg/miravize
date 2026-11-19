import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { format, parseISO } from 'date-fns';
import { Fragment } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { formatHours } from '@/lib/splits';
import { GeneratedBy, ReportMarkdown } from './narrative-report-print';
import { GROUP_LABEL, buildLines, donutSlicePath, formatMoney, isFullRing, } from './reports-page';
export function ReportPrint({ from, to, workspaceName, report, groupBy, projectColor, clientName, narrative, }) {
    const lines = buildLines(report, groupBy, projectColor, clientName);
    const groupLabel = GROUP_LABEL[groupBy];
    const requestSeconds = report.requestTime.reduce((sum, row) => sum + row.seconds, 0);
    const taskSeconds = report.taskTime.reduce((sum, row) => sum + row.seconds, 0);
    return (_jsxs("section", { className: "report-print", children: [_jsxs("header", { className: "flex items-center justify-between gap-4", children: [_jsx("h1", { className: "text-[28px] font-medium leading-none tracking-tight text-[#1c1b19]", children: workspaceName }), _jsx("a", { "data-pdf-link": true, href: "https://miravize.com", className: "inline-block leading-none py-0 my-0", children: _jsx(BrandMark, { onLight: true, className: "size-12 py-0 my-0" }) })] }), _jsxs("div", { className: "mt-5 flex items-end justify-between gap-8 border-t border-[#ddd9d2] pt-4", children: [_jsxs("div", { children: [_jsx("p", { className: "text-[11px] font-medium tracking-[0.08em] text-[#5e5c57] uppercase", children: "Report date" }), _jsx("p", { className: "mt-1 text-[22px] leading-none tracking-tight text-[#1c1b19]", children: formatRange(from, to) })] }), _jsxs("div", { className: "text-right", children: [_jsx("p", { className: "text-[11px] font-medium tracking-[0.08em] text-[#5e5c57] uppercase", children: "Tracked time" }), _jsx("p", { className: "mt-1 text-[22px] leading-none tracking-tight text-[#1c1b19] tabular-nums", children: formatTracked(report.totalSeconds) })] })] }), _jsxs("div", { className: "mt-6 grid grid-cols-2 gap-4", children: [_jsx(PrintDonut, { title: "Hours by project", slices: report.projects }), _jsx(PrintDonut, { title: "Hours by client", slices: report.clients })] }), _jsxs("div", { className: "mt-6", children: [_jsxs("div", { className: "mb-2 flex items-baseline justify-between", children: [_jsx("h2", { className: "text-sm font-medium text-[#1c1b19]", children: "Breakdown" }), _jsx("p", { className: "text-[11px] text-[#5e5c57]", children: groupLabel })] }), lines.length === 0 && report.totalSeconds === 0 && report.requestCount === 0 && report.taskCount === 0 ? (_jsx("p", { className: "text-sm text-[#5e5c57]", children: "No time, requests, or tasks in this range." })) : (_jsx("div", { className: "overflow-visible rounded border border-[#ddd9d2] bg-[#fbfaf7]", children: _jsxs("table", { className: "w-full border-collapse text-[11px]", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-[#ddd9d2] text-left text-[10px] font-medium tracking-[0.06em] text-[#5e5c57]", children: [_jsx("th", { className: "px-3 py-2 font-medium", children: groupLabel }), _jsx("th", { className: "w-36 px-3 py-2 font-medium", children: "Total share" }), _jsx("th", { className: "px-3 py-2 text-right font-medium", children: "Total hours" }), _jsx("th", { className: "px-3 py-2 text-right font-medium", children: "Amount" }), _jsx("th", { className: "px-3 py-2 text-right font-medium", children: "Requests" }), _jsx("th", { className: "px-3 py-2 text-right font-medium", children: "Request hours" }), _jsx("th", { className: "px-3 py-2 text-right font-medium", children: "Tasks" }), _jsx("th", { className: "px-3 py-2 text-right font-medium", children: "Completed" }), _jsx("th", { className: "px-3 py-2 text-right font-medium", children: "Task hours" })] }) }), _jsx("tbody", { children: _jsx(PrintRows, { lines: lines, totalSeconds: report.totalSeconds }) }), _jsx("tfoot", { children: _jsxs("tr", { className: "border-t border-[#ddd9d2] font-medium text-[#1c1b19]", children: [_jsx("td", { className: "px-3 py-2", children: "Total" }), _jsx("td", { className: "px-3 py-2", children: _jsx(ShareBar, { seconds: report.totalSeconds, total: report.totalSeconds }) }), _jsx("td", { className: "px-3 py-2 text-right tabular-nums", children: formatHours(report.totalSeconds) }), _jsx("td", { className: "px-3 py-2 text-right tabular-nums", children: formatMoney(report.money) }), _jsx("td", { className: "px-3 py-2 text-right tabular-nums", children: report.requestCount }), _jsx("td", { className: "px-3 py-2 text-right tabular-nums", children: formatHours(requestSeconds) }), _jsx("td", { className: "px-3 py-2 text-right tabular-nums", children: report.taskCount }), _jsx("td", { className: "px-3 py-2 text-right tabular-nums", children: report.completedCount }), _jsx("td", { className: "px-3 py-2 text-right tabular-nums", children: formatHours(taskSeconds) })] }) })] }) }))] }), narrative ? (_jsx("div", { className: "mt-8 border-t border-[#ddd9d2] pt-6 text-[15px] leading-6 text-[#1c1b19]", children: _jsx(ReportMarkdown, { markdown: narrative }) })) : null, _jsx(GeneratedBy, {})] }));
}
function formatRange(from, to) {
    const start = parseISO(from);
    const end = parseISO(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
        return `${from} – ${to}`;
    if (start.getFullYear() === end.getFullYear()) {
        return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
    }
    return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`;
}
function formatTracked(totalSeconds) {
    const total = Math.max(0, Math.round(totalSeconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.round((total % 3600) / 60);
    if (minutes === 60)
        return `${hours + 1}h 0m`;
    return `${hours}h ${minutes}m`;
}
function PrintDonut({ title, slices }) {
    const total = slices.reduce((sum, slice) => sum + slice.seconds, 0);
    let angle = -Math.PI / 2;
    const arcs = slices.map((slice) => {
        const share = total > 0 ? slice.seconds / total : 0;
        const start = angle;
        angle += share * Math.PI * 2;
        return { ...slice, start, end: angle, share };
    });
    return (_jsxs("div", { className: "print-keep rounded border border-[#ddd9d2] bg-[#fbfaf7] p-4", children: [_jsx("p", { className: "text-sm font-medium text-[#1c1b19]", children: title }), slices.length === 0 ? (_jsx("p", { className: "mt-3 text-sm text-[#5e5c57]", children: "No hours." })) : (_jsxs("div", { className: "mt-3 flex items-center gap-5", children: [_jsx("svg", { viewBox: "0 0 100 100", className: "size-32 shrink-0", role: "img", "aria-label": title, children: arcs.map((slice) => isFullRing(slice.start, slice.end) ? (_jsx("circle", { cx: 50, cy: 50, r: 37, fill: "none", stroke: slice.color, strokeWidth: 18 }, slice.id)) : (_jsx("path", { d: donutSlicePath(50, 50, 46, 28, slice.start, slice.end), fill: slice.color }, slice.id))) }), _jsx("ul", { className: "min-w-0 flex-1 space-y-1", children: arcs.map((slice) => (_jsxs("li", { className: "flex items-center gap-2 text-xs leading-4 text-[#1c1b19]", children: [_jsx("span", { className: "size-2 shrink-0 rounded-sm", style: { background: slice.color }, "aria-hidden": "true" }), _jsx("span", { className: "min-w-0 flex-1", children: slice.label }), _jsxs("span", { className: "shrink-0 tabular-nums text-[#5e5c57]", children: [formatHours(slice.seconds), " (", Math.round(slice.share * 100), "%)"] })] }, slice.id))) })] }))] }));
}
function ShareBar({ seconds, total, color }) {
    const pct = total > 0 ? Math.round((seconds / total) * 100) : 0;
    return (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "h-1.5 w-16 overflow-hidden rounded-full bg-[#e8e6e0]", children: _jsx("div", { className: "h-full rounded-full", style: { width: `${pct}%`, background: color ?? '#1c1b19' } }) }), _jsxs("span", { className: "tabular-nums text-[#5e5c57]", children: [pct, "%"] })] }));
}
function PrintRows({ lines, totalSeconds }) {
    return lines.map((line) => (_jsxs(Fragment, { children: [_jsxs("tr", { className: line.depth === 0 ? 'border-b border-[#ddd9d2] text-[#1c1b19]' : 'border-b border-[#ddd9d2] text-[#5e5c57]', children: [_jsx("td", { className: "px-3 py-1.5", style: { paddingLeft: 12 + line.depth * 16 }, children: _jsx("span", { className: line.depth === 0 ? 'font-medium' : undefined, children: line.label }) }), _jsx("td", { className: "px-3 py-1.5", children: line.billing ? _jsx(ShareBar, { seconds: line.seconds, total: totalSeconds, color: line.color }) : '—' }), _jsx("td", { className: "px-3 py-1.5 text-right tabular-nums", children: line.billing ? formatHours(line.seconds) : '—' }), _jsx("td", { className: "px-3 py-1.5 text-right tabular-nums", children: line.billing ? formatMoney(line.money) : '—' }), _jsx("td", { className: "px-3 py-1.5 text-right tabular-nums", children: line.requests }), _jsx("td", { className: "px-3 py-1.5 text-right tabular-nums", children: formatHours(line.requestSeconds) }), _jsx("td", { className: "px-3 py-1.5 text-right tabular-nums", children: line.tasks }), _jsx("td", { className: "px-3 py-1.5 text-right tabular-nums", children: line.completed }), _jsx("td", { className: "px-3 py-1.5 text-right tabular-nums", children: formatHours(line.taskSeconds) })] }), line.children.length > 0 ? _jsx(PrintRows, { lines: line.children, totalSeconds: totalSeconds }) : null] }, line.key)));
}
