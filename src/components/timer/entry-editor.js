import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { TimeField } from '@/components/ui/time-field';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { qk } from '@/lib/query-keys';
import { applyActivity, applyClients, applyProject } from '@/lib/request-assignment';
import { useWorkspace } from '@/features/workspaces/workspace-context';
import { requestCode } from '@/lib/request-code';
import { taskCode } from '@/lib/task-code';
import { formatDuration } from '@/lib/splits';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
function atTime(day, hhmm) {
    const [hours, minutes] = hhmm.split(':').map(Number);
    const next = new Date(day);
    next.setHours(hours || 0, minutes || 0, 0, 0);
    return next;
}
function spanFrom(day, startHHmm, endHHmm) {
    const start = atTime(day, startHHmm);
    let end = atTime(day, endHHmm);
    if (end.getTime() <= start.getTime())
        end = addDays(end, 1);
    return { start, end };
}
function sameIdList(left, right) {
    if (left.length !== right.length)
        return false;
    const a = [...left].sort();
    const b = [...right].sort();
    return a.every((id, index) => id === b[index]);
}
function sameSaved(left, right) {
    return (left.workspaceId === right.workspaceId &&
        left.projectId === right.projectId &&
        left.description === right.description &&
        left.billable === right.billable &&
        left.activityId === right.activityId &&
        (left.start?.getTime() ?? null) === (right.start?.getTime() ?? null) &&
        (left.end?.getTime() ?? null) === (right.end?.getTime() ?? null) &&
        sameIdList(left.clientIds, right.clientIds) &&
        sameIdList(left.requestIds, right.requestIds) &&
        sameIdList(left.taskIds, right.taskIds));
}
function insidePicker(event) {
    return event.target instanceof Element && Boolean(event.target.closest('[data-radix-popper-content-wrapper]'));
}
function clientMode(links) {
    if (links.length === 0)
        return 'none';
    if (links.every((row) => row.split_percent == null))
        return 'manual';
    return 'auto';
}
function Chip({ label, empty, color, className, }) {
    return (_jsxs("span", { className: cn('inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border px-2.5 text-sm', empty ? 'border-dashed border-border text-muted-foreground' : 'border-border bg-muted/60', className), children: [color ? _jsx("span", { className: "size-2 shrink-0 rounded-sm", style: { background: color }, "aria-hidden": "true" }) : null, _jsx("span", { className: "truncate", children: label })] }));
}
function EntryMetaChips({ workspaceId, projectId, activityId, clientIds, requestIds, taskIds, description, billable, projects, activities, clients, projectClients, stacked = false, onChange, }) {
    const catalog = { projects, activities, clients, projectClients, aliases: [] };
    const inWorkspace = (id) => !workspaceId || id === workspaceId;
    const projectChoices = projects.filter((item) => inWorkspace(item.workspace_id));
    const project = projects.find((item) => item.id === projectId);
    const scopeWorkspaceId = project?.workspace_id || workspaceId;
    const { workspaces } = useWorkspace();
    const idCode = workspaces.find((workspace) => workspace.id === scopeWorkspaceId)?.id_code ?? '';
    const activityChoices = projectId
        ? activities.filter((row) => row.project_id === projectId)
        : activities.filter((row) => inWorkspace(row.workspace_id));
    const activity = activities.find((row) => row.id === activityId);
    const linkedClients = projectClients
        .filter((row) => row.project_id === projectId)
        .map((row) => clients.find((item) => item.id === row.client_id))
        .filter((item) => Boolean(item));
    const clientChoices = projectId
        ? [...new Map(linkedClients.map((item) => [item.id, item])).values()]
        : clients.filter((item) => inWorkspace(item.workspace_id));
    const assignment = { projectId, activityId, clientIds };
    const workspaceRequests = useQuery({
        queryKey: qk.requests(`${scopeWorkspaceId}-picker`),
        enabled: Boolean(scopeWorkspaceId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('requests')
                .select('id, task_number, request, status')
                .eq('workspace_id', scopeWorkspaceId)
                .order('logged_on', { ascending: false })
                .order('task_number', { ascending: false });
            if (error)
                throw error;
            return (data ?? []);
        },
    });
    const requestRows = workspaceRequests.data ?? [];
    const openRequestRows = requestRows.filter((row) => row.status !== 'done');
    const doneRequestRows = requestRows.filter((row) => row.status === 'done');
    const workspaceTasks = useQuery({
        queryKey: qk.tasks(`${scopeWorkspaceId}-picker`),
        enabled: Boolean(scopeWorkspaceId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('tasks')
                .select('id, task_number, task, status')
                .eq('workspace_id', scopeWorkspaceId)
                .order('logged_on', { ascending: false })
                .order('task_number', { ascending: false });
            if (error)
                throw error;
            return (data ?? []);
        },
    });
    const taskRows = workspaceTasks.data ?? [];
    const openTaskRows = taskRows.filter((row) => row.status !== 'done');
    const doneTaskRows = taskRows.filter((row) => row.status === 'done');
    function requestIdLabel(row) {
        return requestCode(row.task_number, idCode);
    }
    function requestMenuLabel(row) {
        const status = row.status === 'doing' ? 'Doing' : row.status === 'done' ? 'Done' : 'Todo';
        return `${requestIdLabel(row)} · ${status} · ${row.request}`;
    }
    const linkedRequests = requestIds
        .map((id) => requestRows.find((row) => row.id === id))
        .filter((row) => Boolean(row));
    const linkedTasks = taskIds
        .map((id) => taskRows.find((row) => row.id === id))
        .filter((row) => Boolean(row));
    function taskMenuLabel(row) {
        const status = row.status === 'doing' ? 'Doing' : row.status === 'done' ? 'Done' : 'Todo';
        return `${taskCode(row.task_number, idCode)} · ${status} · ${row.task}`;
    }
    function toggleTask(taskId, checked) {
        const nextTasks = checked ? taskIds.filter((id) => id !== taskId) : [...taskIds, taskId];
        onChange({ workspaceId: scopeWorkspaceId, projectId, activityId, clientIds, requestIds, taskIds: nextTasks, description, billable });
    }
    function emit(next) {
        const nextProject = projects.find((item) => item.id === next.projectId);
        onChange({
            workspaceId: nextProject?.workspace_id ?? workspaceId,
            projectId: next.projectId,
            activityId: next.activityId,
            clientIds: next.clientIds,
            requestIds,
            taskIds,
            description,
            billable: nextProject && next.projectId !== projectId ? nextProject.billable : billable,
        });
    }
    return (_jsxs("div", { className: cn('flex min-w-0 gap-1.5', stacked ? 'flex-col' : 'flex-wrap'), children: [_jsxs("div", { className: "flex min-w-0 flex-wrap gap-1.5", children: [_jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsx("button", { type: "button", children: _jsx(Chip, { label: project?.name ?? 'Project', empty: !project, color: project?.color }) }) }), _jsxs(DropdownMenuContent, { children: [project ? (_jsx(DropdownMenuItem, { onSelect: () => emit({ projectId: '', activityId: '', clientIds: [] }), children: "Clear project" })) : null, projectChoices.map((item) => (_jsxs(DropdownMenuItem, { onSelect: () => emit(applyProject(assignment, item.id, catalog)), children: [_jsx("span", { className: "size-2 shrink-0 rounded-sm", style: { background: item.color }, "aria-hidden": "true" }), item.name] }, item.id)))] })] }), _jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsx("button", { type: "button", children: _jsx(Chip, { label: activity?.name ?? 'Activity', empty: !activity }) }) }), _jsx(DropdownMenuContent, { children: activityChoices.length === 0 ? (_jsx(DropdownMenuItem, { disabled: true, children: "No activities" })) : (_jsxs(_Fragment, { children: [activity ? (_jsx(DropdownMenuItem, { onSelect: () => emit({ ...assignment, activityId: '' }), children: "Clear activity" })) : null, activityChoices.map((item) => (_jsxs(DropdownMenuItem, { onSelect: () => emit(applyActivity(assignment, item.id, catalog)), children: [item.name, item.client_id ? ` · ${clients.find((client) => client.id === item.client_id)?.name ?? ''}` : ''] }, item.id)))] })) })] }), _jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsx("button", { type: "button", children: _jsx(Chip, { label: clientIds.length === 0
                                            ? 'Client'
                                            : clientIds
                                                .map((id) => clients.find((item) => item.id === id)?.name)
                                                .filter(Boolean)
                                                .join(', '), empty: clientIds.length === 0 }) }) }), _jsx(DropdownMenuContent, { children: clientChoices.length === 0 ? (_jsx(DropdownMenuItem, { disabled: true, children: "No clients" })) : (clientChoices.map((item) => {
                                    const checked = clientIds.includes(item.id);
                                    return (_jsxs(DropdownMenuItem, { onSelect: (event) => {
                                            event.preventDefault();
                                            const nextClients = checked ? clientIds.filter((id) => id !== item.id) : [...clientIds, item.id];
                                            emit(applyClients(assignment, nextClients, catalog));
                                        }, children: [_jsx("span", { className: cn('mr-2 font-mono text-xs', checked ? 'opacity-100' : 'opacity-30'), children: checked ? '✓' : '○' }), item.name] }, item.id));
                                })) })] })] }), _jsxs("div", { className: "flex min-w-0 flex-wrap gap-1.5", children: [_jsxs(DropdownMenu, { children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(DropdownMenuTrigger, { asChild: true, children: _jsx("button", { type: "button", children: _jsx(Chip, { className: "max-w-64", label: linkedRequests.length === 0
                                                        ? 'Requests'
                                                        : linkedRequests.map(requestIdLabel).join(', '), empty: requestIds.length === 0 }) }) }) }), linkedRequests.length > 0 ? (_jsx(TooltipContent, { className: "max-w-sm", children: linkedRequests.length === 1 ? (linkedRequests[0].request) : (_jsx("span", { className: "block space-y-1", children: linkedRequests.map((row) => (_jsxs("span", { className: "block", children: [requestIdLabel(row), " \u00B7 ", row.request] }, row.id))) })) })) : null] }), _jsx(DropdownMenuContent, { className: "w-80", children: requestRows.length === 0 ? (_jsx(DropdownMenuItem, { disabled: true, children: "No requests" })) : (_jsxs(_Fragment, { children: [openRequestRows.map((item) => {
                                            const checked = requestIds.includes(item.id);
                                            return (_jsxs(DropdownMenuItem, { className: "min-w-0", onSelect: (event) => {
                                                    event.preventDefault();
                                                    const nextRequests = checked ? requestIds.filter((id) => id !== item.id) : [...requestIds, item.id];
                                                    onChange({ workspaceId: scopeWorkspaceId, projectId, activityId, clientIds, requestIds: nextRequests, taskIds, description, billable });
                                                }, children: [_jsx("span", { className: cn('mr-2 shrink-0 font-mono text-xs', checked ? 'opacity-100' : 'opacity-30'), children: checked ? '✓' : '○' }), _jsx("span", { className: "min-w-0 truncate", children: requestMenuLabel(item) })] }, item.id));
                                        }), doneRequestRows.length > 0 ? (_jsxs(_Fragment, { children: [openRequestRows.length > 0 ? _jsx(DropdownMenuSeparator, {}) : null, doneRequestRows.map((item) => {
                                                    const checked = requestIds.includes(item.id);
                                                    return (_jsxs(DropdownMenuItem, { className: "min-w-0 text-muted-foreground line-through", onSelect: (event) => {
                                                            event.preventDefault();
                                                            const nextRequests = checked ? requestIds.filter((id) => id !== item.id) : [...requestIds, item.id];
                                                            onChange({ workspaceId: scopeWorkspaceId, projectId, activityId, clientIds, requestIds: nextRequests, taskIds, description, billable });
                                                        }, children: [_jsx("span", { className: cn('mr-2 shrink-0 font-mono text-xs no-underline', checked ? 'opacity-100' : 'opacity-30'), children: checked ? '✓' : '○' }), _jsx("span", { className: "min-w-0 truncate", children: requestMenuLabel(item) })] }, item.id));
                                                })] })) : null] })) })] }), _jsxs(DropdownMenu, { children: [_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(DropdownMenuTrigger, { asChild: true, children: _jsx("button", { type: "button", children: _jsx(Chip, { className: "max-w-64", label: linkedTasks.length === 0 ? 'Tasks' : linkedTasks.map((row) => taskCode(row.task_number, idCode)).join(', '), empty: taskIds.length === 0 }) }) }) }), linkedTasks.length > 0 ? (_jsx(TooltipContent, { className: "max-w-sm", children: linkedTasks.length === 1 ? (linkedTasks[0].task) : (_jsx("span", { className: "block space-y-1", children: linkedTasks.map((row) => (_jsxs("span", { className: "block", children: [taskCode(row.task_number, idCode), " \u00B7 ", row.task] }, row.id))) })) })) : null] }), _jsx(DropdownMenuContent, { className: "w-80", children: taskRows.length === 0 ? (_jsx(DropdownMenuItem, { disabled: true, children: "No tasks" })) : (_jsxs(_Fragment, { children: [openTaskRows.map((item) => {
                                            const checked = taskIds.includes(item.id);
                                            return (_jsxs(DropdownMenuItem, { className: "min-w-0", onSelect: (event) => {
                                                    event.preventDefault();
                                                    toggleTask(item.id, checked);
                                                }, children: [_jsx("span", { className: cn('mr-2 shrink-0 font-mono text-xs', checked ? 'opacity-100' : 'opacity-30'), children: checked ? '✓' : '○' }), _jsx("span", { className: "min-w-0 truncate", children: taskMenuLabel(item) })] }, item.id));
                                        }), doneTaskRows.length > 0 ? (_jsxs(_Fragment, { children: [openTaskRows.length > 0 ? _jsx(DropdownMenuSeparator, {}) : null, doneTaskRows.map((item) => {
                                                    const checked = taskIds.includes(item.id);
                                                    return (_jsxs(DropdownMenuItem, { className: "min-w-0 text-muted-foreground line-through", onSelect: (event) => {
                                                            event.preventDefault();
                                                            toggleTask(item.id, checked);
                                                        }, children: [_jsx("span", { className: cn('mr-2 shrink-0 font-mono text-xs no-underline', checked ? 'opacity-100' : 'opacity-30'), children: checked ? '✓' : '○' }), _jsx("span", { className: "min-w-0 truncate", children: taskMenuLabel(item) })] }, item.id));
                                                })] })) : null] })) })] })] })] }));
}
function EntryEditor({ draft, projects, activities, clients, projectClients, pending, onClose, onSave, onPatch, onDelete, onContinue, }) {
    const [fields, setFields] = useState({
        workspaceId: '',
        projectId: '',
        description: '',
        billable: true,
        activityId: '',
        clientIds: [],
        requestIds: [],
        taskIds: [],
        start: null,
        end: null,
    });
    const [confirmDelete, setConfirmDelete] = useState(false);
    const snapshot = useRef(fields);
    const pendingCommit = useRef(null);
    const saving = useRef(false);
    useEffect(() => {
        if (!draft)
            return;
        const entry = draft.entry;
        const next = {
            workspaceId: entry?.workspace_id || draft.workspaceId,
            projectId: entry?.project_id ?? '',
            description: entry?.description ?? '',
            billable: entry?.billable ?? true,
            activityId: entry?.activity_id ?? '',
            clientIds: entry?.time_entry_clients?.map((row) => row.client_id) ?? [],
            requestIds: entry?.time_entry_requests?.map((row) => row.request_id) ?? [],
            taskIds: entry?.time_entry_tasks?.map((row) => row.task_id) ?? [],
            start: draft.start ?? (entry ? new Date(entry.started_at) : null),
            end: draft.end ?? (entry?.stopped_at ? new Date(entry.stopped_at) : null),
        };
        setFields(next);
        snapshot.current = next;
        setConfirmDelete(false);
    }, [draft]);
    const label = draft?.mode === 'edit' ? 'Logged entry' : draft?.mode === 'start' ? 'Start timer' : 'New entry';
    const duration = fields.start && fields.end ? formatDuration(Math.max(0, Math.round((fields.end.getTime() - fields.start.getTime()) / 1000))) : null;
    function payload(next) {
        if (!draft || !next.projectId)
            return null;
        const workspaceId = projects.find((project) => project.id === next.projectId)?.workspace_id || next.workspaceId;
        return {
            mode: draft.mode,
            id: draft.entry?.id,
            workspaceId,
            projectId: next.projectId,
            description: next.description,
            billable: next.billable,
            tagIds: [],
            activityId: next.activityId || null,
            clientIds: next.clientIds,
            requestIds: next.requestIds,
            taskIds: next.taskIds,
            start: next.start ?? undefined,
            end: next.end ?? undefined,
        };
    }
    async function commit(next) {
        if (draft?.mode !== 'edit' || !draft.entry) {
            setFields(next);
            return;
        }
        setFields(next);
        if (!payload(next))
            return;
        pendingCommit.current = next;
        if (saving.current)
            return;
        saving.current = true;
        try {
            while (pendingCommit.current) {
                const target = pendingCommit.current;
                pendingCommit.current = null;
                const input = payload(target);
                const previousFields = snapshot.current;
                const previous = payload(previousFields);
                if (!input || !previous)
                    continue;
                if (sameSaved(input, previous))
                    continue;
                try {
                    await onPatch(input, previous);
                    snapshot.current = target;
                }
                catch (err) {
                    pendingCommit.current = null;
                    setFields(previousFields);
                    toast({
                        tone: 'error',
                        title: 'Could not save entry',
                        description: err instanceof Error ? err.message : 'Try again.',
                    });
                    break;
                }
            }
        }
        finally {
            saving.current = false;
        }
    }
    const dateValue = fields.start ? format(fields.start, 'yyyy-MM-dd') : '';
    const startValue = fields.start ? format(fields.start, 'HH:mm') : '';
    const endValue = fields.end ? format(fields.end, 'HH:mm') : '';
    return (_jsxs(_Fragment, { children: [_jsxs(Popover, { open: Boolean(draft), onOpenChange: (open) => {
                    if (!open && confirmDelete)
                        return;
                    if (!open)
                        onClose();
                }, children: [_jsx(PopoverAnchor, { asChild: true, children: _jsx("span", { className: "pointer-events-none fixed size-0", style: draft ? { left: draft.point.x, top: draft.point.y } : undefined }) }), _jsx(PopoverContent, { "aria-label": label, collisionPadding: 12, className: "w-[28rem] p-4", onCloseAutoFocus: (event) => event.preventDefault(), onInteractOutside: (event) => {
                            if (confirmDelete || insidePicker(event))
                                event.preventDefault();
                        }, onPointerDownOutside: (event) => {
                            if (confirmDelete || insidePicker(event))
                                event.preventDefault();
                        }, onFocusOutside: (event) => {
                            if (confirmDelete || insidePicker(event))
                                event.preventDefault();
                        }, children: projects.length === 0 ? (_jsxs("p", { className: "text-sm text-muted-foreground", children: ["No projects yet. Add one in", ' ', _jsx(Link, { to: "/projects", className: "underline underline-offset-2", children: "Projects" }), "."] })) : (_jsxs("div", { className: "grid gap-3", children: [_jsxs("div", { className: "flex items-start gap-2", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [draft?.mode === 'edit' ? (_jsx("p", { className: "mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground", children: "Logged" })) : _jsx("p", { className: "mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground", children: "Draft" }), _jsx("input", { "aria-label": "Description", className: "w-full rounded-md bg-transparent text-base font-semibold outline-none transition-colors duration-75 hover:bg-muted placeholder:font-normal placeholder:text-muted-foreground", value: fields.description, placeholder: draft?.mode === 'edit' ? 'Description · Enter to save' : 'Description', onChange: (event) => setFields((current) => ({ ...current, description: event.target.value })), onKeyDown: (event) => {
                                                        if (event.key === 'Escape') {
                                                            event.preventDefault();
                                                            setFields((current) => ({ ...current, description: snapshot.current.description }));
                                                            event.currentTarget.blur();
                                                        }
                                                        if (event.key !== 'Enter')
                                                            return;
                                                        event.preventDefault();
                                                        event.currentTarget.blur();
                                                        if (draft?.mode === 'edit')
                                                            void commit({ ...fields, description: fields.description });
                                                    } })] }), draft?.mode === 'edit' && draft.entry && onDelete ? (_jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsx(Button, { type: "button", variant: "ghost", size: "icon", className: "size-8 shrink-0", "aria-label": "More", children: _jsx(EllipsisHorizontalIcon, {}) }) }), _jsx(DropdownMenuContent, { align: "end", children: _jsx(DropdownMenuItem, { className: "text-destructive", onSelect: () => setConfirmDelete(true), children: "Delete" }) })] })) : null] }), _jsx(EntryMetaChips, { workspaceId: fields.workspaceId, projectId: fields.projectId, activityId: fields.activityId, clientIds: fields.clientIds, requestIds: fields.requestIds, taskIds: fields.taskIds, description: fields.description, billable: fields.billable, projects: projects, activities: activities, clients: clients, projectClients: projectClients, stacked: true, onChange: (next) => void commit({ ...fields, ...next }) }), draft?.mode !== 'start' && fields.start && fields.end ? (_jsxs("div", { className: "flex flex-nowrap items-center gap-1.5", children: [_jsx(DatePicker, { size: "sm", "aria-label": "Date", value: dateValue, onChange: (value) => {
                                                const [year, month, day] = value.split('-').map(Number);
                                                const nextDay = new Date(year, (month || 1) - 1, day || 1);
                                                if (Number.isNaN(nextDay.getTime()))
                                                    return;
                                                const { start, end } = spanFrom(nextDay, startValue, endValue);
                                                void commit({ ...fields, start, end });
                                            } }), _jsxs("div", { className: "inline-flex h-8 shrink-0 items-center justify-around rounded-md border border-border bg-muted/60 px-2 font-mono text-xs", children: [_jsx(TimeField, { "aria-label": "Start time", value: startValue, onChange: (value) => {
                                                        if (!fields.start)
                                                            return;
                                                        const { start, end } = spanFrom(fields.start, value, endValue);
                                                        void commit({ ...fields, start, end });
                                                    } }), _jsx("span", { className: "pointer-events-none shrink-0 px-2 text-muted-foreground", "aria-hidden": "true", children: "\u2192" }), _jsx(TimeField, { "aria-label": "End time", value: endValue, onChange: (value) => {
                                                        if (!fields.start)
                                                            return;
                                                        const { start, end } = spanFrom(fields.start, startValue, value);
                                                        void commit({ ...fields, start, end });
                                                    } })] }), duration ? (_jsx("span", { className: "ml-auto shrink-0 font-mono text-xs tabular-nums text-muted-foreground", children: duration })) : null] })) : null, _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Switch, { id: "entry-billable", checked: fields.billable, onCheckedChange: (billable) => void commit({ ...fields, billable }) }), _jsx(Label, { htmlFor: "entry-billable", children: "Billable" }), draft?.mode === 'edit' ? (_jsx(Button, { className: "ml-auto", disabled: pending || !onContinue, onClick: () => {
                                                if (!onContinue)
                                                    return;
                                                const workspaceId = projects.find((project) => project.id === fields.projectId)?.workspace_id || fields.workspaceId;
                                                onContinue({
                                                    workspaceId,
                                                    projectId: fields.projectId || null,
                                                    description: fields.description,
                                                    billable: fields.billable,
                                                    activityId: fields.activityId || null,
                                                    clientIds: fields.clientIds,
                                                    requestIds: fields.requestIds,
                                                    taskIds: fields.taskIds,
                                                });
                                            }, children: "Continue?" })) : (_jsx(Button, { className: "ml-auto", disabled: pending || !fields.projectId, onClick: () => {
                                                const input = payload(fields);
                                                if (!input)
                                                    return;
                                                onSave(input);
                                            }, children: draft?.mode === 'start' ? 'Start' : 'Log time' }))] })] })) })] }), _jsx(Dialog, { open: confirmDelete, onOpenChange: setConfirmDelete, children: _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { className: "font-bold text-destructive", children: "Delete entry?" }), _jsx(DialogDescription, { children: "This time entry is removed. This action is irreversible." })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { type: "button", variant: "outline", onClick: () => setConfirmDelete(false), children: "Cancel" }), _jsx(Button, { type: "button", variant: "destructive", disabled: pending || !draft?.entry, onClick: () => {
                                        if (!draft?.entry || !onDelete)
                                            return;
                                        onDelete(draft.entry.id);
                                        setConfirmDelete(false);
                                    }, children: "Delete" })] })] }) })] }));
}
export { Chip, EntryEditor, EntryMetaChips, clientMode };
