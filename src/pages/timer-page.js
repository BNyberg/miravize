import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon, ChevronLeftIcon, ChevronRightIcon, PlayIcon, StopIcon, } from '@heroicons/react/24/outline';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, addWeeks, eachDayOfInterval, format, getISOWeek, isSameWeek, isToday, startOfDay, startOfWeek, } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { EntryEditor, EntryMetaChips } from '@/components/timer/entry-editor';
import { QuickStartMenu } from '@/components/timer/quick-start-menu';
import { useTimerSpan } from '@/components/timer/use-timer-span';
import { WeekGrid } from '@/components/timer/week-grid';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/features/auth/auth-context';
import { useCatalog } from '@/features/projects/use-catalog';
import { useNow } from '@/features/timer/use-now';
import { useRunningTimer } from '@/features/timer/use-running-timer';
import { useWorkspace } from '@/features/workspaces/workspace-context';
import { qk } from '@/lib/query-keys';
import { formatDuration } from '@/lib/splits';
import { supabase } from '@/lib/supabase';
import { ENTRY_SELECT, createEntry, deleteEntry, patchEntry, startTimer, stopTimer, updateEntry, updateEntryDescription, updateEntrySpan, updateRunningEntry, } from '@/lib/timer';
import { cn } from '@/lib/utils';
/** 5-day view starts Monday. Shift so Today still lands in the window on the weekend. */
function fiveDayShift(now) {
    const day = now.getDay();
    if (day === 6)
        return 1;
    if (day === 0)
        return 2;
    return 0;
}
function useNarrow() {
    const [narrow, setNarrow] = useState(false);
    useEffect(() => {
        const query = window.matchMedia('(max-width: 767px)');
        const apply = () => setNarrow(query.matches);
        apply();
        query.addEventListener('change', apply);
        return () => query.removeEventListener('change', apply);
    }, []);
    return narrow;
}
export function TimerPage() {
    const { user } = useAuth();
    const { workspaceId, isAll } = useWorkspace();
    const catalog = useCatalog();
    const narrow = useNarrow();
    const [anchor, setAnchor] = useState(() => new Date());
    const [shiftDays, setShiftDays] = useState(0);
    const [span, setSpan] = useTimerSpan();
    const [draft, setDraft] = useState(null);
    const [error, setError] = useState(null);
    const [focusNowAt, setFocusNowAt] = useState(1);
    const qc = useQueryClient();
    const { data: running } = useRunningTimer();
    const now = useNow(Boolean(running));
    const dayView = narrow || span === 1;
    const count = dayView ? 1 : span;
    const rangeStart = dayView
        ? startOfDay(anchor)
        : addDays(startOfWeek(anchor, { weekStartsOn: 1 }), shiftDays);
    const days = eachDayOfInterval({ start: rangeStart, end: addDays(rangeStart, count - 1) });
    const rangeEnd = addDays(rangeStart, count);
    const entries = useQuery({
        queryKey: qk.entries(workspaceId, `${rangeStart.toISOString()}-${count}-${user?.id ?? ''}`),
        enabled: Boolean(user),
        queryFn: async () => {
            let query = supabase
                .from('time_entries')
                .select(ENTRY_SELECT)
                .eq('user_id', user.id)
                .gte('started_at', rangeStart.toISOString())
                .lt('started_at', rangeEnd.toISOString())
                .order('started_at', { ascending: true });
            if (!isAll)
                query = query.eq('workspace_id', workspaceId);
            const { data, error: err } = await query;
            if (err)
                throw err;
            return (data ?? []);
        },
    });
    const blocks = useMemo(() => {
        const unique = new Map();
        for (const entry of entries.data ?? [])
            unique.set(entry.id, entry);
        if (running && !unique.has(running.id))
            unique.set(running.id, running);
        return [...unique.values()];
    }, [entries.data, running]);
    const elapsed = running ? Math.floor((now - new Date(running.started_at).getTime()) / 1000) : 0;
    async function refresh() {
        await qc.invalidateQueries({ queryKey: ['entries'] });
        await qc.invalidateQueries({ queryKey: qk.running });
    }
    async function persistEntry(input) {
        if (input.mode === 'start') {
            await startTimer({
                workspaceId: input.workspaceId,
                projectId: input.projectId,
                description: input.description,
                billable: input.billable,
                tagIds: input.tagIds,
                source: 'manual',
                activityId: input.activityId,
                clientIds: input.clientIds,
                requestIds: input.requestIds,
                taskIds: input.taskIds,
            });
            return;
        }
        if (!input.start || !input.end)
            return;
        if (input.mode === 'create') {
            await createEntry({
                workspaceId: input.workspaceId,
                projectId: input.projectId,
                description: input.description,
                billable: input.billable,
                tagIds: input.tagIds,
                startedAt: input.start,
                stoppedAt: input.end,
                activityId: input.activityId,
                clientIds: input.clientIds,
                requestIds: input.requestIds,
                taskIds: input.taskIds,
            });
            return;
        }
        if (!input.id)
            return;
        await updateEntry({
            id: input.id,
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            description: input.description,
            billable: input.billable,
            tagIds: input.tagIds,
            startedAt: input.start,
            stoppedAt: input.end,
            activityId: input.activityId,
            clientIds: input.clientIds,
            requestIds: input.requestIds,
            taskIds: input.taskIds,
        });
    }
    const save = useMutation({
        mutationFn: persistEntry,
        onSuccess: async () => {
            setDraft(null);
            setError(null);
            await refresh();
        },
        onError: (err) => setError(err.message),
    });
    const move = useMutation({
        mutationFn: (input) => updateEntrySpan(input.id, input.start, input.end),
        onSuccess: refresh,
        onError: (err) => setError(err.message),
    });
    const remove = useMutation({
        mutationFn: deleteEntry,
        onSuccess: async () => {
            setDraft(null);
            await refresh();
        },
        onError: (err) => setError(err.message),
    });
    const stop = useMutation({
        mutationFn: stopTimer,
        onSuccess: refresh,
        onError: (err) => setError(err.message),
    });
    const describe = useMutation({
        mutationFn: (input) => updateEntryDescription(input.id, input.description),
        onSuccess: refresh,
        onError: (err) => setError(err.message),
    });
    const assignRunning = useMutation({
        mutationFn: (input) => {
            if (!running)
                throw new Error('No running timer');
            return updateRunningEntry({
                id: running.id,
                workspaceId: running.workspace_id,
                projectId: input.projectId || null,
                description: input.description,
                billable: input.billable,
                activityId: input.activityId || null,
                clientIds: input.clientIds,
                requestIds: input.requestIds,
                taskIds: input.taskIds,
            });
        },
        onSuccess: refresh,
        onError: (err) => setError(err.message),
    });
    const quickStart = useMutation({
        mutationFn: (input) => startTimer({
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            description: input.description,
            billable: input.billable,
            tagIds: [],
            source: 'quick_start',
            activityId: input.activityId,
            clientIds: input.clientIds,
            requestIds: input.requestIds,
            taskIds: input.taskIds,
        }),
        onSuccess: async () => {
            setDraft(null);
            setError(null);
            await refresh();
        },
        onError: (err) => setError(err.message),
    });
    function openDraft(next) {
        requestAnimationFrame(() => setDraft(next));
    }
    const weekNumber = getISOWeek(rangeStart);
    const label = dayView
        ? `${isToday(rangeStart) ? 'Today · ' : ''}${format(rangeStart, 'EEE d MMM')}`
        : shiftDays !== 0
            ? `${format(rangeStart, 'EEE d MMM')} – ${format(days[days.length - 1], 'EEE d MMM')} · W${weekNumber}`
            : isSameWeek(rangeStart, new Date(), { weekStartsOn: 1 })
                ? `This week · W${weekNumber}`
                : `${format(rangeStart, 'd MMM')} – ${format(days[days.length - 1], 'd MMM')} · W${weekNumber}`;
    const quickProjects = catalog.projects.filter((project) => (isAll ? true : project.workspace_id === workspaceId));
    return (_jsxs("div", { className: "flex min-h-0 flex-1 flex-col", children: [_jsx("h1", { className: "sr-only", children: "Timer" }), error ? (_jsx("div", { role: "alert", className: "mx-4 mt-3 border border-destructive/40 px-3 py-2 text-sm md:mx-6", children: error })) : null, _jsxs("div", { className: "@container flex flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 md:px-6", children: [narrow ? null : (_jsx("div", { className: "flex h-9 overflow-hidden rounded-md border border-border", children: [
                            [1, 'Day'],
                            [5, '5'],
                            [7, '7'],
                        ].map(([value, text]) => (_jsx("button", { type: "button", "aria-pressed": span === value, className: cn('h-full px-3 text-sm', span === value ? 'bg-foreground text-background' : 'text-muted-foreground'), onClick: () => setSpan(value), children: text }, value))) })), _jsx(Button, { variant: "outline", size: "icon", "aria-label": dayView ? 'Previous day' : 'Previous week', onClick: () => setAnchor((current) => (dayView ? addDays(current, -1) : addWeeks(current, -1))), children: _jsx(ChevronLeftIcon, { "aria-hidden": "true" }) }), _jsx(Button, { variant: "outline", onClick: () => {
                            const now = new Date();
                            setAnchor(now);
                            setShiftDays(span === 5 ? fiveDayShift(now) : 0);
                            setFocusNowAt((current) => current + 1);
                        }, children: "Today" }), _jsx(Button, { variant: "outline", size: "icon", "aria-label": dayView ? 'Next day' : 'Next week', onClick: () => setAnchor((current) => (dayView ? addDays(current, 1) : addWeeks(current, 1))), children: _jsx(ChevronRightIcon, { "aria-hidden": "true" }) }), _jsxs("div", { className: "flex h-9 shrink-0 flex-col items-center justify-center", children: [_jsx("p", { className: "text-sm leading-none", children: label }), dayView ? null : (_jsx(TooltipProvider, { delayDuration: 0, disableHoverableContent: true, children: _jsxs("div", { className: "mt-0.5 flex items-center justify-center text-xs leading-none text-muted-foreground", children: [[
                                            { days: -3, label: '3 days back', icon: ChevronDoubleLeftIcon },
                                            { days: -1, label: '1 day back', icon: ChevronLeftIcon },
                                        ].map((step) => (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", className: "rounded-sm p-0.5 hover:bg-muted hover:text-foreground", "aria-label": `${step.label}. Today returns to this week.`, onClick: () => setShiftDays((current) => current + step.days), children: _jsx(step.icon, { className: "size-3", "aria-hidden": "true" }) }) }), _jsxs(TooltipContent, { side: "bottom", children: [step.label, ". Today returns to this week."] })] }, step.days))), _jsx("span", { className: "px-1", children: "Shift dates" }), [
                                            { days: 1, label: '1 day forward', icon: ChevronRightIcon },
                                            { days: 3, label: '3 days forward', icon: ChevronDoubleRightIcon },
                                        ].map((step) => (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", className: "rounded-sm p-0.5 hover:bg-muted hover:text-foreground", "aria-label": `${step.label}. Today returns to this week.`, onClick: () => setShiftDays((current) => current + step.days), children: _jsx(step.icon, { className: "size-3", "aria-hidden": "true" }) }) }), _jsxs(TooltipContent, { side: "bottom", children: [step.label, ". Today returns to this week."] })] }, step.days)))] }) }))] }), running ? (_jsxs("div", { className: "flex min-w-0 basis-full items-center gap-2 @min-[72rem]:basis-auto @min-[72rem]:flex-1", children: [_jsx("span", { className: "hidden h-4 w-px shrink-0 bg-border @min-[72rem]:block", "aria-hidden": "true" }), _jsx(EntryMetaChips, { workspaceId: running.workspace_id, projectId: running.project_id ?? '', activityId: running.activity_id ?? '', clientIds: running.time_entry_clients?.map((row) => row.client_id) ?? [], requestIds: running.time_entry_requests?.map((row) => row.request_id) ?? [], taskIds: running.time_entry_tasks?.map((row) => row.task_id) ?? [], description: running.description, billable: running.billable, projects: catalog.projects.filter((project) => project.workspace_id === running.workspace_id), activities: catalog.activities, clients: catalog.clients, projectClients: catalog.projectClients, onChange: (next) => assignRunning.mutate(next) }), _jsx("input", { "aria-label": "Description", defaultValue: running.description, placeholder: "Description", className: "h-8 min-w-0 flex-1 rounded-md bg-transparent px-1 text-sm outline-none transition-colors duration-75 hover:bg-muted placeholder:text-muted-foreground", onKeyDown: (event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        event.currentTarget.blur();
                                    }
                                }, onBlur: (event) => {
                                    if (event.target.value !== running.description) {
                                        describe.mutate({ id: running.id, description: event.target.value });
                                    }
                                } }, `${running.id}:${running.description}`), _jsx("span", { className: "ml-auto font-mono text-sm tabular-nums", children: formatDuration(elapsed) }), _jsxs("div", { className: "flex", children: [_jsxs(Button, { className: "rounded-r-none", onClick: () => stop.mutate(), disabled: stop.isPending || quickStart.isPending, children: [_jsx(StopIcon, { "aria-hidden": "true" }), "Stop"] }), _jsx(QuickStartMenu, { label: "Quick switch", pending: stop.isPending || quickStart.isPending, projects: quickProjects, activities: catalog.activities, clients: catalog.clients, projectClients: catalog.projectClients, onSelect: (input) => quickStart.mutate(input) })] })] })) : null, running ? null : (_jsx("div", { className: "ml-auto flex shrink-0 items-center gap-3", children: _jsxs("div", { className: "flex", children: [isAll ? (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("span", { className: "inline-flex cursor-help", children: _jsxs(Button, { className: "pointer-events-none rounded-r-none", disabled: true, children: [_jsx(PlayIcon, { "aria-hidden": "true" }), "Start"] }) }) }), _jsxs(TooltipContent, { children: ["Switch to a single workspace,", _jsx("br", {}), "or use Quick start to the right."] })] })) : (_jsxs(Button, { className: "rounded-r-none", disabled: quickStart.isPending, onClick: () => quickStart.mutate({
                                        workspaceId,
                                        projectId: null,
                                        billable: true,
                                        description: '',
                                    }), children: [_jsx(PlayIcon, { "aria-hidden": "true" }), "Start"] })), _jsx(QuickStartMenu, { label: "Quick start", pending: quickStart.isPending, projects: quickProjects, activities: catalog.activities, clients: catalog.clients, projectClients: catalog.projectClients, onSelect: (input) => quickStart.mutate(input) })] }) }))] }), _jsx(WeekStrip, { entries: blocks, start: rangeStart, end: rangeEnd, now: now }), _jsx(WeekGrid, { days: days, entries: blocks, now: now, focusNowAt: focusNowAt, clients: catalog.clients, projectClients: catalog.projectClients, onCreate: (start, end, point) => openDraft({
                    mode: 'create',
                    workspaceId: isAll ? '' : workspaceId,
                    start,
                    end,
                    point,
                }), onMove: (id, start, end) => move.mutate({ id, start, end }), onDescribe: (id, description) => describe.mutate({ id, description }), onEdit: (entry, point) => {
                    if (!entry.stopped_at)
                        return;
                    openDraft({
                        mode: 'edit',
                        entry,
                        workspaceId: entry.workspace_id,
                        start: new Date(entry.started_at),
                        end: new Date(entry.stopped_at),
                        point,
                    });
                } }), _jsx(EntryEditor, { draft: draft, projects: catalog.projects, activities: catalog.activities, clients: catalog.clients, projectClients: catalog.projectClients, pending: save.isPending || remove.isPending || quickStart.isPending, onClose: () => setDraft(null), onSave: (input) => save.mutate(input), onPatch: async (input, previous) => {
                    if (!input.id || !input.start || !input.end || !previous.start || !previous.end)
                        return;
                    await patchEntry({
                        id: input.id,
                        workspaceId: input.workspaceId,
                        projectId: input.projectId,
                        description: input.description,
                        billable: input.billable,
                        activityId: input.activityId,
                        clientIds: input.clientIds,
                        requestIds: input.requestIds,
                        taskIds: input.taskIds,
                        startedAt: input.start,
                        stoppedAt: input.end,
                    }, {
                        id: input.id,
                        workspaceId: previous.workspaceId,
                        projectId: previous.projectId,
                        description: previous.description,
                        billable: previous.billable,
                        activityId: previous.activityId,
                        clientIds: previous.clientIds,
                        requestIds: previous.requestIds,
                        taskIds: previous.taskIds,
                        startedAt: previous.start,
                        stoppedAt: previous.end,
                    });
                    await refresh();
                }, onDelete: (id) => remove.mutate(id), onContinue: (input) => quickStart.mutate(input) })] }));
}
function formatSpan(totalSeconds) {
    const seconds = Math.max(0, Math.round(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours === 0)
        return `${minutes}m`;
    if (minutes === 0)
        return `${hours}h`;
    return `${hours}h ${minutes}m`;
}
function WeekStrip({ entries, start, end, now, }) {
    const rangeStart = start.getTime();
    const rangeEnd = end.getTime();
    const byProject = new Map();
    for (const entry of entries) {
        const entryStart = new Date(entry.started_at).getTime();
        const entryEnd = entry.stopped_at ? new Date(entry.stopped_at).getTime() : now;
        const seconds = Math.max(0, Math.min(entryEnd, rangeEnd) - Math.max(entryStart, rangeStart)) / 1000;
        if (seconds <= 0)
            continue;
        const id = entry.project_id ?? 'unassigned';
        const current = byProject.get(id);
        if (current)
            current.seconds += seconds;
        else {
            byProject.set(id, {
                id,
                name: entry.project?.name ?? 'Project',
                color: entry.project?.color || '#5E5C57',
                seconds,
            });
        }
    }
    const shares = [...byProject.values()].sort((a, b) => b.seconds - a.seconds);
    const total = shares.reduce((sum, row) => sum + row.seconds, 0);
    let acc = 0;
    const placed = shares.map((share) => {
        const width = total > 0 ? (share.seconds / total) * 100 : 0;
        const left = acc;
        acc += width;
        return { ...share, width, left };
    });
    return (_jsxs("div", { className: "flex items-center gap-3 px-4 pb-3 md:px-6", children: [_jsxs("div", { className: "relative h-4 min-w-0 flex-1", children: [_jsx("div", { className: "pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-sm bg-muted", children: placed.map((share) => (_jsx("span", { className: "absolute inset-y-0", style: {
                                left: `${share.left}%`,
                                width: `${Math.max(share.width, 0.4)}%`,
                                background: share.color,
                            } }, share.id))) }), placed.map((share) => {
                        const duration = formatSpan(share.seconds);
                        const percent = Math.round(share.width);
                        const label = `${duration} (${percent}%)`;
                        return (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", "aria-label": `${share.name} ${label}`, className: "absolute top-1/2 h-4 -translate-y-1/2", style: { left: `${share.left}%`, width: `${Math.max(share.width, 0.4)}%` } }) }), _jsx(TooltipContent, { side: "top", children: _jsxs("span", { className: "flex items-center gap-2", children: [_jsx("span", { className: "size-2 shrink-0 rounded-sm", style: { background: share.color }, "aria-hidden": "true" }), _jsx("span", { children: share.name }), _jsx("span", { className: "font-mono tabular-nums", children: label })] }) })] }, share.id));
                    })] }), _jsx("p", { className: "shrink-0 font-mono text-xs tabular-nums", children: formatSpan(total) })] }));
}
