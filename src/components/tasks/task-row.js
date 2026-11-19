import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { applyActivity, applyProject, assignmentClientMode, displayClientIds, } from '@/lib/request-assignment';
import { RowTrackButton } from '@/components/timer/row-track-button';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from '@/components/ui/dialog';
import { TableSelect, TableSelectContent, TableSelectItem, TableSelectTrigger, TableSelectValue, } from '@/components/ui/table-select';
import { TableCell, TableRow } from '@/components/ui/table';
import { taskCode } from '@/lib/task-code';
import { cn } from '@/lib/utils';
const NONE = '__none__';
const STATUS_CLASS = {
    todo: 'text-destructive',
    doing: 'text-amber-800 dark:text-amber-300',
    done: '',
};
const STATUSES = [
    { value: 'todo', label: 'Todo' },
    { value: 'doing', label: 'Doing' },
    { value: 'done', label: 'Done' },
];
function CellText({ value, label, required, emptyFallback, className, onSave, }) {
    return (_jsx("input", { "aria-label": label, defaultValue: value, className: cn('w-full rounded-md bg-transparent px-1 py-1 outline-none transition-colors duration-75 hover:bg-muted', className), onKeyDown: (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
            }
        }, onBlur: (event) => {
            const next = event.currentTarget.value;
            if (required) {
                if (!next.trim()) {
                    event.currentTarget.value = value;
                    return;
                }
                if (next.trim() === value.trim())
                    return;
                onSave(next.trim());
                return;
            }
            const trimmed = next.trim();
            const saved = trimmed || emptyFallback || '';
            if (saved === value.trim()) {
                event.currentTarget.value = value;
                return;
            }
            onSave(saved);
        } }, value));
}
export function TaskLedgerRow({ row, catalog, workspaceName, idCode, showWorkspace, onPatch, tracking, active, stopping, onTrack, onStop, deleting, onDelete, }) {
    const assignment = {
        projectId: row.project_id ?? '',
        activityId: row.activity_id ?? '',
        clientIds: displayClientIds(row, catalog),
    };
    const mode = assignmentClientMode(catalog, assignment.projectId);
    const projects = catalog.projects.filter((project) => project.workspace_id === row.workspace_id);
    const activities = assignment.projectId
        ? catalog.activities.filter((activity) => activity.project_id === assignment.projectId)
        : catalog.activities.filter((activity) => activity.workspace_id === row.workspace_id);
    const linked = catalog.projectClients
        .filter((link) => link.project_id === assignment.projectId)
        .map((link) => catalog.clients.find((client) => client.id === link.client_id))
        .filter((item) => Boolean(item));
    const uniqueClients = [...new Map(linked.map((item) => [item.id, item])).values()];
    const [confirmDelete, setConfirmDelete] = useState(false);
    const clientNames = assignment.clientIds
        .map((id) => catalog.clients.find((client) => client.id === id)?.name)
        .filter(Boolean)
        .join(', ');
    function persist(next, extra) {
        onPatch({
            id: row.id,
            requester: extra?.requester ?? row.requester,
            task: extra?.task ?? row.task,
            status: extra?.status ?? row.status,
            projectId: extra?.projectId ?? next.projectId,
            activityId: extra?.activityId ?? next.activityId,
            clientIds: extra?.clientIds ?? next.clientIds,
            notes: extra?.notes === undefined ? row.additional_notes : extra.notes,
        });
    }
    const done = row.status === 'done';
    return (_jsxs(TableRow, { className: cn(done && 'text-muted-foreground'), children: [_jsx(TableCell, { className: "whitespace-nowrap tabular", children: taskCode(row.task_number, idCode) }), showWorkspace ? _jsx(TableCell, { className: "min-w-[10rem]", children: workspaceName }) : null, _jsx(TableCell, { className: "whitespace-nowrap", children: row.logged_on }), _jsx(TableCell, { className: "w-32 min-w-32 max-w-32", children: _jsx(CellText, { value: row.requester.trim() || '-', label: "Requester", emptyFallback: "-", className: cn('min-w-0', done && 'line-through'), onSave: (requester) => persist(assignment, { requester }) }) }), _jsx(TableCell, { className: "min-w-[28rem]", children: _jsx(CellText, { value: row.task, label: "Task", required: true, className: cn('min-w-0', done && 'line-through'), onSave: (task) => persist(assignment, { task }) }) }), _jsx(TableCell, { className: "min-w-[8rem]", children: _jsxs(TableSelect, { value: row.status, onValueChange: (value) => persist(assignment, { status: value }), children: [_jsx(TableSelectTrigger, { "aria-label": "Status", className: STATUS_CLASS[row.status], children: _jsx(TableSelectValue, {}) }), _jsx(TableSelectContent, { children: STATUSES.map((status) => (_jsx(TableSelectItem, { value: status.value, className: STATUS_CLASS[status.value], children: status.label }, status.value))) })] }) }), _jsx(TableCell, { className: "min-w-[12rem]", children: _jsxs(TableSelect, { value: assignment.projectId || NONE, onValueChange: (value) => persist(applyProject(assignment, value === NONE ? '' : value, catalog)), children: [_jsx(TableSelectTrigger, { "aria-label": "Project", children: _jsx(TableSelectValue, {}) }), _jsxs(TableSelectContent, { children: [_jsx(TableSelectItem, { value: NONE, children: "No project" }), projects.map((project) => (_jsx(TableSelectItem, { value: project.id, children: _jsxs("span", { className: "flex items-center gap-2", children: [_jsx("span", { className: "size-2 shrink-0 rounded-sm", style: { background: project.color }, "aria-hidden": "true" }), project.name] }) }, project.id)))] })] }) }), _jsx(TableCell, { className: "min-w-[12rem]", children: _jsxs(TableSelect, { value: assignment.activityId || NONE, onValueChange: (value) => persist(value === NONE ? { ...assignment, activityId: '' } : applyActivity(assignment, value, catalog)), children: [_jsx(TableSelectTrigger, { "aria-label": "Activity", children: _jsx(TableSelectValue, {}) }), _jsxs(TableSelectContent, { children: [_jsx(TableSelectItem, { value: NONE, children: "No activity" }), activities.map((activity) => (_jsxs(TableSelectItem, { value: activity.id, children: [activity.name, activity.client_id
                                            ? ` · ${catalog.clients.find((client) => client.id === activity.client_id)?.name ?? ''}`
                                            : ''] }, activity.id)))] })] }) }), _jsx(TableCell, { className: "min-w-[12rem]", children: mode === 'auto' ? (_jsxs(TableSelect, { value: "split", disabled: true, children: [_jsx(TableSelectTrigger, { "aria-label": "Client", children: _jsx(TableSelectValue, { children: clientNames || 'Split clients' }) }), _jsx(TableSelectContent, { children: _jsx(TableSelectItem, { value: "split", children: clientNames || 'Split clients' }) })] })) : (_jsxs(TableSelect, { value: assignment.clientIds.length === 1 ? assignment.clientIds[0] : assignment.clientIds.length === 0 ? NONE : 'multi', onValueChange: (value) => {
                        if (value === 'multi')
                            return;
                        persist({ ...assignment, clientIds: value === NONE ? [] : [value] });
                    }, children: [_jsx(TableSelectTrigger, { "aria-label": "Client", className: cn(uniqueClients.length === 0 && !assignment.projectId && 'opacity-70'), children: _jsx(TableSelectValue, { children: assignment.clientIds.length > 1 ? clientNames : undefined }) }), _jsxs(TableSelectContent, { children: [_jsx(TableSelectItem, { value: NONE, children: "No client" }), assignment.clientIds.length > 1 ? _jsx(TableSelectItem, { value: "multi", children: clientNames }) : null, uniqueClients.map((client) => (_jsx(TableSelectItem, { value: client.id, children: client.name }, client.id)))] })] })) }), _jsx(TableCell, { className: "min-w-[16rem]", children: _jsx(CellText, { value: row.additional_notes ?? '', label: "Notes", onSave: (notes) => persist(assignment, { notes: notes.trim() || null }) }) }), _jsxs(TableCell, { className: "sticky right-0 z-10 w-20 border-l border-border bg-card", children: [_jsxs("div", { className: "flex items-center gap-1", children: [_jsx(RowTrackButton, { active: active, starting: tracking, stopping: stopping, canStart: Boolean(row.project_id) && row.status !== 'done', blockedLabel: row.status === 'done' ? 'This task is done. Change its status to work on it again.' : undefined, onStart: onTrack, onStop: onStop }), _jsx(Button, { type: "button", variant: "outline", size: "icon", className: "size-8", "aria-label": `Delete ${row.task}`, disabled: deleting, onClick: () => setConfirmDelete(true), children: _jsx(XMarkIcon, { "aria-hidden": "true" }) })] }), _jsx(Dialog, { open: confirmDelete, onOpenChange: (open) => !deleting && setConfirmDelete(open), children: _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsxs(DialogTitle, { className: "font-bold text-destructive", children: ["Delete ", row.task, "?"] }), _jsx(DialogDescription, { children: "This removes the task. Linked time entries stay, without this task." })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { type: "button", variant: "outline", onClick: () => setConfirmDelete(false), disabled: deleting, children: "Cancel" }), _jsx(Button, { type: "button", variant: "destructive", loading: deleting, onClick: () => {
                                                onDelete();
                                            }, children: "Delete" })] })] }) })] })] }));
}
