import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { EllipsisHorizontalIcon, InformationCircleIcon, PencilIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCatalog } from '@/features/projects/use-catalog';
import { useWorkspace } from '@/features/workspaces/workspace-context';
import { qk } from '@/lib/query-keys';
import { splitsTotal } from '@/lib/splits';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
const PRESETS = [
    { label: '50/50', parts: [50, 50] },
    { label: '60/40', parts: [60, 40] },
    { label: '70/30', parts: [70, 30] },
];
const SWATCHES = [
    '#1F7A4D',
    '#0F6B5C',
    '#1F5E7A',
    '#2F4A8A',
    '#5E3A8A',
    '#8A3A5E',
    '#B42318',
    '#9A4A12',
    '#7A6B1F',
    '#3D5A3A',
    '#5E5C57',
    '#1C1B19',
];
const DEFAULT_COLOR = '#1F7A4D';
const CURRENCIES = ['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK'];
function failMessage(err) {
    const rec = err && typeof err === 'object' ? err : null;
    const message = rec && typeof rec.message === 'string' ? rec.message : err instanceof Error ? err.message : '';
    const details = rec && typeof rec.details === 'string' ? rec.details : '';
    const hint = rec && typeof rec.hint === 'string' ? rec.hint : '';
    const code = rec && typeof rec.code === 'string' ? rec.code : '';
    const joined = [message, details, hint].filter(Boolean).join(' ');
    if (code === '23505' || /projects_workspace_id_name|duplicate key value.*projects/i.test(joined)) {
        return 'A project with this name already exists.';
    }
    return joined || 'Try again.';
}
async function deleteActivity(id, onSaved) {
    const { error } = await supabase.from('activities').delete().eq('id', id);
    if (error) {
        toast({ tone: 'error', title: 'Could not delete activity', description: failMessage(error) });
        return;
    }
    onSaved();
}
async function setActivityDefault(activity, onSaved) {
    const { error } = await supabase.from('activities').update({ is_default: !activity.is_default }).eq('id', activity.id);
    if (error) {
        toast({
            tone: 'error',
            title: activity.is_default ? 'Could not clear default' : 'Could not set default',
            description: failMessage(error),
        });
    }
    else {
        onSaved();
    }
}
async function renameActivity(id, name, onSaved) {
    const { error } = await supabase.from('activities').update({ name }).eq('id', id);
    if (error) {
        toast({ tone: 'error', title: 'Could not rename activity', description: failMessage(error) });
        return false;
    }
    onSaved();
    return true;
}
async function moveActivity(id, patch, onSaved) {
    const { error } = await supabase.from('activities').update(patch).eq('id', id);
    if (error) {
        toast({ tone: 'error', title: 'Could not move activity', description: failMessage(error) });
        return false;
    }
    onSaved();
    return true;
}
function RemoveActivityButton({ onClick }) {
    return (_jsx(Button, { type: "button", variant: "ghost", size: "icon", className: "size-7 shrink-0", onClick: onClick, "aria-label": "Remove activity", children: _jsx(XMarkIcon, {}) }));
}
function ActivityRowMenu({ onRename, onMove, onToggleDefault, isDefault, }) {
    return (_jsx("div", { className: "ml-auto flex shrink-0 items-center", children: _jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsx(Button, { type: "button", variant: "ghost", size: "icon", className: "size-7 shrink-0", "aria-label": "Activity actions", children: _jsx(EllipsisHorizontalIcon, {}) }) }), _jsxs(DropdownMenuContent, { align: "end", children: [_jsx(DropdownMenuItem, { onSelect: onRename, children: "Rename" }), onMove ? _jsx(DropdownMenuItem, { onSelect: onMove, children: "Move" }) : null, onToggleDefault ? (_jsx(DropdownMenuItem, { onSelect: onToggleDefault, children: isDefault ? 'Clear default' : 'Set as default' })) : null] })] }) }));
}
function ActivityRenameDialog({ activity, open, onOpenChange, onSaved, }) {
    const [draft, setDraft] = useState(null);
    const [saving, setSaving] = useState(false);
    const name = open && activity ? (draft?.id === activity.id ? draft.name : activity.name) : '';
    const trimmed = name.trim();
    const dirty = activity != null && trimmed.length > 0 && trimmed !== activity.name.trim();
    return (_jsx(Dialog, { open: open, onOpenChange: (next) => {
            if (!next) {
                setDraft(null);
                setSaving(false);
            }
            onOpenChange(next);
        }, children: _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: "Rename activity" }), _jsx(DialogDescription, { children: "Logged time stays on this activity." })] }), _jsx(Input, { value: name, onChange: (e) => {
                        if (!activity)
                            return;
                        setDraft({ id: activity.id, name: e.target.value });
                    }, placeholder: "Activity name", autoFocus: true }), _jsxs(DialogFooter, { children: [_jsx(Button, { type: "button", variant: "outline", onClick: () => onOpenChange(false), children: "Cancel" }), _jsx(Button, { type: "button", disabled: !dirty || saving, loading: saving, onClick: () => {
                                if (!activity || !dirty)
                                    return;
                                setSaving(true);
                                void renameActivity(activity.id, trimmed, onSaved).then((ok) => {
                                    setSaving(false);
                                    if (ok)
                                        onOpenChange(false);
                                });
                            }, children: "Save" })] })] }) }));
}
function ActivityMoveDialog({ activity, projects, clients, open, onOpenChange, onSaved, }) {
    const [targetId, setTargetId] = useState('');
    const [saving, setSaving] = useState(false);
    const clientActivity = Boolean(activity?.client_id);
    const options = clientActivity
        ? clients.filter((client) => client.id !== activity?.client_id)
        : projects.filter((project) => project.id !== activity?.project_id);
    const ready = Boolean(targetId) && options.some((option) => option.id === targetId);
    return (_jsx(Dialog, { open: open, onOpenChange: (next) => {
            if (!next) {
                setTargetId('');
                setSaving(false);
            }
            onOpenChange(next);
        }, children: _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsxs(DialogTitle, { children: ["Move ", activity?.name ?? 'activity'] }), _jsx(DialogDescription, { children: clientActivity
                                ? 'Move this client activity to another client. It stays on the same project.'
                                : 'Move this project activity to another project.' })] }), _jsxs(Select, { value: targetId || undefined, onValueChange: setTargetId, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: clientActivity ? 'Client' : 'Project' }) }), _jsx(SelectContent, { children: options.map((option) => (_jsx(SelectItem, { value: option.id, children: option.name }, option.id))) })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { type: "button", variant: "outline", onClick: () => onOpenChange(false), children: "Cancel" }), _jsx(Button, { type: "button", disabled: !ready || saving || !activity, loading: saving, onClick: () => {
                                if (!activity || !ready)
                                    return;
                                setSaving(true);
                                const patch = clientActivity ? { client_id: targetId } : { project_id: targetId };
                                void moveActivity(activity.id, patch, onSaved).then((ok) => {
                                    setSaving(false);
                                    if (ok)
                                        onOpenChange(false);
                                });
                            }, children: "Move" })] })] }) }));
}
function DraftRenameDialog({ current, open, onOpenChange, onSave, title = 'Rename activity', placeholder = 'Activity name', }) {
    const [draft, setDraft] = useState(null);
    const name = open && current != null ? (draft?.current === current ? draft.name : current) : '';
    const trimmed = name.trim();
    const dirty = current != null && trimmed.length > 0 && trimmed !== current.trim();
    return (_jsx(Dialog, { open: open, onOpenChange: (next) => {
            if (!next)
                setDraft(null);
            onOpenChange(next);
        }, children: _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: title }) }), _jsx(Input, { value: name, onChange: (e) => {
                        if (current == null)
                            return;
                        setDraft({ current, name: e.target.value });
                    }, placeholder: placeholder, autoFocus: true }), _jsxs(DialogFooter, { children: [_jsx(Button, { type: "button", variant: "outline", onClick: () => onOpenChange(false), children: "Cancel" }), _jsx(Button, { type: "button", disabled: !dirty, onClick: () => {
                                if (!dirty)
                                    return;
                                void Promise.resolve(onSave(trimmed)).then((ok) => {
                                    if (ok)
                                        onOpenChange(false);
                                });
                            }, children: "Save" })] })] }) }));
}
function AliasChip({ shortcut, canManage, onRename, onDelete, }) {
    return (_jsxs(Badge, { variant: "secondary", className: "group gap-0.5 font-mono", children: [shortcut, canManage ? (_jsxs("span", { className: "inline-flex items-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100", children: [_jsx("button", { type: "button", className: "inline-flex size-4 items-center justify-center rounded-sm hover:bg-background/60", "aria-label": `Rename ${shortcut}`, onClick: onRename, children: _jsx(PencilIcon, { className: "size-3" }) }), _jsx("button", { type: "button", className: "inline-flex size-4 items-center justify-center rounded-sm hover:bg-background/60", "aria-label": `Delete ${shortcut}`, onClick: onDelete, children: _jsx(XMarkIcon, { className: "size-3" }) })] })) : null] }));
}
function ConfirmDeleteDialog({ name, open, onOpenChange, onConfirm, }) {
    return (_jsx(Dialog, { open: open, onOpenChange: onOpenChange, children: _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsxs(DialogTitle, { className: "font-bold text-destructive", children: ["Delete ", name, "?"] }), _jsx(DialogDescription, { children: "This action is irreversible." })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { type: "button", variant: "outline", onClick: () => onOpenChange(false), children: "Cancel" }), _jsx(Button, { type: "button", variant: "destructive", disabled: !name, onClick: onConfirm, children: "Delete" })] })] }) }));
}
export function ProjectsPage() {
    const { workspaceId, isAll, canManage, canManageWorkspace, workspaces } = useWorkspace();
    const catalog = useCatalog();
    const qc = useQueryClient();
    const [error, setError] = useState(null);
    const [section, setSection] = useState('projects');
    const [draftKey, setDraftKey] = useState(0);
    const [clientKey, setClientKey] = useState(0);
    const [createFor, setCreateFor] = useState(null);
    const [pickedWorkspace, setPickedWorkspace] = useState('');
    const [projectWorkspaceId, setProjectWorkspaceId] = useState(null);
    const [clientWorkspaceId, setClientWorkspaceId] = useState(null);
    const manageable = workspaces.filter((workspace) => canManageWorkspace(workspace.id));
    const canCreate = isAll ? manageable.length > 0 : canManage;
    function openCreate(next) {
        if (!isAll) {
            if (next === 'projects') {
                setProjectWorkspaceId(workspaceId);
                setDraftKey((n) => n + 1);
            }
            else {
                setClientWorkspaceId(workspaceId);
                setClientKey((n) => n + 1);
            }
            setSection(next);
            return;
        }
        setPickedWorkspace(manageable[0]?.id ?? '');
        setCreateFor(next);
    }
    function confirmCreate() {
        if (!createFor || !pickedWorkspace)
            return;
        if (createFor === 'projects') {
            setProjectWorkspaceId(pickedWorkspace);
            setDraftKey((n) => n + 1);
        }
        else {
            setClientWorkspaceId(pickedWorkspace);
            setClientKey((n) => n + 1);
        }
        setSection(createFor);
        setCreateFor(null);
    }
    async function refresh() {
        await Promise.all([
            qc.invalidateQueries({ queryKey: qk.clients(workspaceId) }),
            qc.invalidateQueries({ queryKey: qk.projects(workspaceId) }),
            qc.invalidateQueries({ queryKey: qk.tags(workspaceId) }),
            qc.invalidateQueries({ queryKey: qk.aliases(workspaceId) }),
            qc.invalidateQueries({ queryKey: qk.projectClients(workspaceId) }),
            qc.invalidateQueries({ queryKey: qk.projectTags(workspaceId) }),
            qc.invalidateQueries({ queryKey: qk.activities(workspaceId) }),
        ]);
    }
    return (_jsxs("div", { className: "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto lg:overflow-hidden", children: [_jsx("h1", { className: "sr-only", children: "Projects" }), error ? (_jsx("div", { role: "alert", className: "border border-destructive/40 px-3 py-2 text-sm", children: error })) : null, _jsxs("div", { className: "flex shrink-0 items-center gap-2", children: [_jsx("div", { className: "flex h-9 overflow-hidden rounded-md border border-border", children: [
                            ['projects', 'Projects'],
                            ['clients', 'Clients'],
                        ].map(([value, text]) => (_jsx("button", { type: "button", "aria-pressed": section === value, className: cn('h-full px-3 text-sm', section === value ? 'bg-foreground text-background' : 'text-muted-foreground'), onClick: () => setSection(value), children: text }, value))) }), canCreate && section === 'projects' ? (_jsx(Button, { variant: "outline", className: "ml-auto", onClick: () => openCreate('projects'), children: "New project" })) : null, canCreate && section === 'clients' ? (_jsx(Button, { variant: "outline", className: "ml-auto", onClick: () => openCreate('clients'), children: "New client" })) : null] }), section === 'projects' ? (_jsx(ProjectEditor, { canManageWorkspace: canManageWorkspace, catalog: catalog, catalogWorkspaceId: workspaceId, createWorkspaceId: isAll ? projectWorkspaceId : workspaceId, onError: setError, onSaved: () => void refresh() }, draftKey)) : null, section === 'clients' ? (_jsx(ClientEditor, { canManageWorkspace: canManageWorkspace, catalog: catalog, catalogWorkspaceId: workspaceId, createWorkspaceId: isAll ? clientWorkspaceId : workspaceId, onError: setError, onSaved: () => void refresh() }, clientKey)) : null, _jsx(Dialog, { open: createFor != null, onOpenChange: (open) => {
                    if (!open)
                        setCreateFor(null);
                }, children: _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: createFor === 'clients' ? 'New client' : 'New project' }), _jsx(DialogDescription, { children: "Choose the workspace this belongs to." })] }), _jsxs("div", { className: "grid gap-1.5", children: [_jsx(Label, { htmlFor: "create-workspace", children: "Workspace" }), _jsxs(Select, { value: pickedWorkspace, onValueChange: setPickedWorkspace, children: [_jsx(SelectTrigger, { id: "create-workspace", children: _jsx(SelectValue, { placeholder: "Workspace" }) }), _jsx(SelectContent, { children: manageable.map((workspace) => (_jsx(SelectItem, { value: workspace.id, children: workspace.name }, workspace.id))) })] })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { type: "button", variant: "outline", onClick: () => setCreateFor(null), children: "Cancel" }), _jsx(Button, { type: "button", disabled: !pickedWorkspace, onClick: confirmCreate, children: "Continue" })] })] }) })] }));
}
function ClientEditor({ catalog, canManageWorkspace, createWorkspaceId, catalogWorkspaceId, onError, onSaved, }) {
    const [editing, setEditing] = useState(null);
    const [name, setName] = useState('');
    const [billable, setBillable] = useState(true);
    const [overrides, setOverrides] = useState({});
    const [activityName, setActivityName] = useState('');
    const [activityProjectId, setActivityProjectId] = useState('');
    const [saving, setSaving] = useState(false);
    const [snapshot, setSnapshot] = useState({ name: '', billable: true, overrides: {} });
    const [pendingActivity, setPendingActivity] = useState(null);
    const [renaming, setRenaming] = useState(null);
    const [moving, setMoving] = useState(null);
    const qc = useQueryClient();
    function load(client) {
        const nextName = client?.name ?? '';
        const nextBillable = client?.default_billable ?? true;
        const nextOverrides = {};
        if (client) {
            for (const row of catalog.projectClients.filter((item) => item.client_id === client.id)) {
                nextOverrides[row.project_id] = row.hourly_rate != null ? String(row.hourly_rate) : '';
            }
        }
        setEditing(client ?? null);
        setName(nextName);
        setBillable(nextBillable);
        setActivityName('');
        setOverrides(nextOverrides);
        setSnapshot({ name: nextName, billable: nextBillable, overrides: nextOverrides });
        setPendingActivity(null);
        setRenaming(null);
        setMoving(null);
        if (client) {
            const first = catalog.projectClients.find((item) => item.client_id === client.id);
            setActivityProjectId(first?.project_id ?? '');
        }
        else {
            setActivityProjectId('');
        }
    }
    const activeWorkspaceId = editing?.workspace_id ?? createWorkspaceId ?? '';
    const canManage = Boolean(activeWorkspaceId) && canManageWorkspace(activeWorkspaceId);
    const links = editing ? catalog.projectClients.filter((row) => row.client_id === editing.id) : [];
    const clientActivities = editing ? catalog.activities.filter((row) => row.client_id === editing.id) : [];
    const clientDirty = name !== snapshot.name ||
        billable !== snapshot.billable ||
        Object.keys({ ...snapshot.overrides, ...overrides }).some((key) => (overrides[key] ?? '') !== (snapshot.overrides[key] ?? ''));
    async function save() {
        if (!name.trim()) {
            onError('Client needs a name.');
            return;
        }
        const targetWorkspaceId = editing?.workspace_id ?? createWorkspaceId;
        if (!targetWorkspaceId) {
            toast({ tone: 'error', title: 'Could not save client', description: 'Choose a workspace.' });
            return;
        }
        onError(null);
        setSaving(true);
        try {
            let saved;
            if (editing) {
                const { data, error } = await supabase
                    .from('clients')
                    .update({ name: name.trim(), default_billable: billable })
                    .eq('id', editing.id)
                    .select('*')
                    .single();
                if (error)
                    throw error;
                saved = data;
            }
            else {
                const { data, error } = await supabase
                    .from('clients')
                    .insert({ workspace_id: targetWorkspaceId, name: name.trim(), default_billable: billable })
                    .select('*')
                    .single();
                if (error)
                    throw error;
                saved = data;
            }
            qc.setQueryData(qk.clients(catalogWorkspaceId), (current) => {
                const list = current ?? [];
                const index = list.findIndex((item) => item.id === saved.id);
                if (index >= 0) {
                    const next = [...list];
                    next[index] = saved;
                    return next;
                }
                return [...list, saved];
            });
            load(saved);
            for (const row of catalog.projectClients.filter((item) => item.client_id === saved.id)) {
                const raw = overrides[row.project_id] ?? '';
                const { error } = await supabase.rpc('set_project_client_rate', {
                    p_project_id: row.project_id,
                    p_client_id: saved.id,
                    p_hourly_rate: raw.trim() === '' ? null : Number(raw),
                });
                if (error)
                    throw error;
            }
            setSnapshot({ name: saved.name, billable: saved.default_billable, overrides: { ...overrides } });
            onSaved();
            toast({ tone: 'success', title: 'Client saved', description: saved.name });
        }
        catch (err) {
            toast({ tone: 'error', title: 'Could not save client', description: failMessage(err) });
        }
        finally {
            setSaving(false);
        }
    }
    async function addActivity() {
        if (!editing || !activityName.trim() || !activityProjectId)
            return;
        const { error } = await supabase.from('activities').insert({
            workspace_id: editing.workspace_id,
            project_id: activityProjectId,
            client_id: editing.id,
            name: activityName.trim(),
        });
        if (error)
            throw error;
        setActivityName('');
        onSaved();
    }
    return (_jsxs("div", { className: "grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]", children: [_jsx("ul", { className: "h-full min-h-0 overflow-y-auto rounded-lg border border-border", children: catalog.clients.length === 0 ? (_jsx("li", { className: "px-3 py-3 text-sm text-muted-foreground", children: "No clients yet. Use New client." })) : (catalog.clients.map((client) => {
                    const count = catalog.projectClients.filter((row) => row.client_id === client.id).length;
                    return (_jsx("li", { className: "border-t border-border first:border-t-0", children: _jsxs("button", { type: "button", className: cn('block w-full px-3 py-2.5 text-left', editing?.id === client.id && 'bg-muted'), onClick: () => load(client), children: [_jsx("p", { className: "truncate text-sm font-medium leading-5", children: client.name }), _jsx("p", { className: "mt-1 min-h-4 font-mono text-[11px] leading-4 tabular-nums text-muted-foreground", children: count > 0 ? `${count} ${count === 1 ? 'project' : 'projects'}` : '' })] }) }, client.id));
                })) }), _jsxs("div", { className: "h-full min-h-0 overflow-y-auto rounded-lg border border-border bg-card p-4", children: [_jsx("p", { className: "text-[11px] font-medium tracking-[0.08em] text-muted-foreground", children: editing ? 'CLIENT' : 'NEW CLIENT' }), !canManage ? _jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: "View only." }) : null, _jsxs("div", { className: "mt-4 grid gap-1.5", children: [_jsx(Label, { htmlFor: "cname", children: "Name" }), _jsx(Input, { id: "cname", value: name, onChange: (e) => setName(e.target.value), disabled: !canManage })] }), _jsxs("div", { className: "mt-4 flex items-center gap-2", children: [_jsx(Switch, { checked: billable, onCheckedChange: setBillable, disabled: !canManage, id: "cbill" }), _jsx(Label, { htmlFor: "cbill", children: "Billable by default" })] }), editing ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mt-4", children: [_jsx("p", { className: "mb-2 text-sm font-medium", children: "Projects" }), links.length === 0 ? (_jsx("p", { className: "text-sm text-muted-foreground", children: "Link this client from a project." })) : (links.map((link) => {
                                        const project = catalog.allProjects.find((item) => item.id === link.project_id);
                                        const currency = project?.currency ?? 'SEK';
                                        return (_jsxs("div", { className: "mb-2 flex items-center gap-2", children: [_jsx("span", { className: "size-2.5 shrink-0 rounded-sm", style: { background: project?.color || '#5E5C57' }, "aria-hidden": "true" }), _jsx("span", { className: "min-w-0 flex-1 truncate text-sm", children: project?.name }), link.split_percent != null ? (_jsxs("span", { className: "font-mono text-[11px] tabular-nums text-muted-foreground", children: [Number(link.split_percent), "%"] })) : null, _jsx(Input, { className: "w-24", type: "number", min: 0, step: 0.01, disabled: !canManage, value: overrides[link.project_id] ?? '', placeholder: project?.hourly_rate != null ? String(project.hourly_rate) : 'Default', onChange: (e) => setOverrides((current) => ({ ...current, [link.project_id]: e.target.value })) }), _jsx("span", { className: "w-8 text-sm text-muted-foreground", children: currency })] }, link.id));
                                    }))] }), _jsxs("div", { className: "mt-4", children: [_jsx("p", { className: "mb-2 text-sm font-medium", children: "Activities" }), canManage && links.length > 0 ? (_jsxs("form", { className: "mb-2 flex h-9 items-center gap-2", onSubmit: (e) => {
                                            e.preventDefault();
                                            void addActivity();
                                        }, children: [_jsxs(Select, { value: activityProjectId || undefined, onValueChange: setActivityProjectId, children: [_jsx(SelectTrigger, { className: "w-2/5", children: _jsx(SelectValue, { placeholder: "Project" }) }), _jsx(SelectContent, { children: links.map((link) => {
                                                            const project = catalog.allProjects.find((item) => item.id === link.project_id);
                                                            return (_jsx(SelectItem, { value: link.project_id, children: project?.name }, link.project_id));
                                                        }) })] }), _jsx(Input, { className: "h-9 min-w-0 flex-1", value: activityName, onChange: (e) => setActivityName(e.target.value), placeholder: "Activity name" }), _jsx(Button, { type: "submit", className: "h-9", disabled: !activityName.trim() || !activityProjectId, children: "Add" })] })) : null, clientActivities.length === 0 ? (_jsx("p", { className: "text-sm text-muted-foreground", children: "No activities yet." })) : (_jsx("ul", { children: clientActivities.map((activity) => {
                                            const project = catalog.allProjects.find((item) => item.id === activity.project_id);
                                            return (_jsxs("li", { className: "flex items-center gap-2 py-1.5 text-sm", children: [_jsx("span", { className: "size-2.5 shrink-0 rounded-sm", style: { background: project?.color || '#5E5C57' }, "aria-hidden": "true" }), _jsx("span", { className: "truncate", children: activity.name }), _jsx("span", { className: "text-muted-foreground", children: project?.name }), canManage ? (_jsxs(_Fragment, { children: [_jsx(ActivityRowMenu, { onRename: () => setRenaming(activity), onMove: () => setMoving(activity) }), _jsx(RemoveActivityButton, { onClick: () => setPendingActivity({ id: activity.id, name: activity.name }) })] })) : null] }, activity.id));
                                        }) }))] })] })) : null, canManage ? (_jsx("div", { className: "mt-4 flex justify-end", children: _jsx(Button, { onClick: () => void save(), disabled: !clientDirty, loading: saving, children: "Save client" }) })) : null, _jsx(ActivityRenameDialog, { activity: renaming, open: Boolean(renaming), onOpenChange: (open) => {
                            if (!open)
                                setRenaming(null);
                        }, onSaved: onSaved }), _jsx(ActivityMoveDialog, { activity: moving, projects: catalog.allProjects.filter((project) => project.workspace_id === moving?.workspace_id), clients: catalog.clients.filter((client) => client.workspace_id === moving?.workspace_id), open: Boolean(moving), onOpenChange: (open) => {
                            if (!open)
                                setMoving(null);
                        }, onSaved: onSaved }), _jsx(ConfirmDeleteDialog, { name: pendingActivity?.name ?? null, open: Boolean(pendingActivity), onOpenChange: (open) => {
                            if (!open)
                                setPendingActivity(null);
                        }, onConfirm: () => {
                            if (!pendingActivity)
                                return;
                            const id = pendingActivity.id;
                            setPendingActivity(null);
                            void deleteActivity(id, onSaved);
                        } })] })] }));
}
function ProjectEditor({ catalog, canManageWorkspace, createWorkspaceId, catalogWorkspaceId, onError, onSaved, }) {
    const [editing, setEditing] = useState(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState(DEFAULT_COLOR);
    const [billable, setBillable] = useState(true);
    const [rate, setRate] = useState('');
    const [currency, setCurrency] = useState('SEK');
    const [splits, setSplits] = useState([]);
    const [activityName, setActivityName] = useState('');
    const [shortcut, setShortcut] = useState('');
    const [draftActivities, setDraftActivities] = useState([]);
    const [draftAliases, setDraftAliases] = useState([]);
    const [saveHint, setSaveHint] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmName, setConfirmName] = useState('');
    const [pendingActivity, setPendingActivity] = useState(null);
    const [renaming, setRenaming] = useState(null);
    const [moving, setMoving] = useState(null);
    const [renamingDraft, setRenamingDraft] = useState(null);
    const [renamingAlias, setRenamingAlias] = useState(null);
    const [pendingAlias, setPendingAlias] = useState(null);
    const [saving, setSaving] = useState(false);
    const [snapshot, setSnapshot] = useState({
        name: '',
        description: '',
        color: DEFAULT_COLOR,
        billable: true,
        rate: '',
        currency: 'SEK',
        splits: [],
    });
    const picker = useRef(null);
    const qc = useQueryClient();
    function load(project) {
        const nextName = project?.name ?? '';
        const nextDescription = project?.description ?? '';
        const nextColor = project?.color ?? DEFAULT_COLOR;
        const nextBillable = project?.billable ?? true;
        const nextRate = project?.hourly_rate != null ? String(project.hourly_rate) : '';
        const nextCurrency = project?.currency ?? 'SEK';
        const nextSplits = project
            ? catalog.projectClients
                .filter((row) => row.project_id === project.id)
                .map((row) => ({
                clientId: row.client_id,
                percent: row.split_percent == null ? null : Number(row.split_percent),
            }))
            : [];
        setEditing(project ?? null);
        setName(nextName);
        setDescription(nextDescription);
        setColor(nextColor);
        setBillable(nextBillable);
        setActivityName('');
        setShortcut('');
        setDraftActivities([]);
        setDraftAliases([]);
        setPendingActivity(null);
        setRenaming(null);
        setMoving(null);
        setRenamingDraft(null);
        setRenamingAlias(null);
        setPendingAlias(null);
        setSaveHint(null);
        setRate(nextRate);
        setCurrency(nextCurrency);
        setSplits(nextSplits);
        setSnapshot({
            name: nextName,
            description: nextDescription,
            color: nextColor,
            billable: nextBillable,
            rate: nextRate,
            currency: nextCurrency,
            splits: nextSplits,
        });
    }
    const activeWorkspaceId = editing?.workspace_id ?? createWorkspaceId ?? '';
    const canManage = Boolean(activeWorkspaceId) && canManageWorkspace(activeWorkspaceId);
    const workspaceClients = catalog.clients.filter((client) => client.workspace_id === activeWorkspaceId);
    const clientActivityGroups = (() => {
        if (!editing)
            return [];
        const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
        const groups = new Map();
        for (const activity of catalog.activities) {
            if (activity.project_id !== editing.id || activity.client_id == null)
                continue;
            const client = catalog.clients.find((item) => item.id === activity.client_id);
            const group = groups.get(activity.client_id) ?? {
                id: activity.client_id,
                name: client?.name ?? 'Client',
                activities: [],
            };
            group.activities.push(activity);
            groups.set(activity.client_id, group);
        }
        return [...groups.values()]
            .sort((a, b) => byName(a.name, b.name))
            .map((group) => ({ ...group, activities: [...group.activities].sort((a, b) => byName(a.name, b.name)) }));
    })();
    const total = splitsTotal(splits);
    const uniqueClients = new Set(splits.map((row) => row.clientId)).size === splits.length;
    const noSplit = splits.every((row) => row.percent == null);
    const projectDirty = name !== snapshot.name ||
        description !== snapshot.description ||
        color.toUpperCase() !== snapshot.color.toUpperCase() ||
        billable !== snapshot.billable ||
        rate !== snapshot.rate ||
        currency !== snapshot.currency ||
        splits.length !== snapshot.splits.length ||
        splits.some((row, index) => row.clientId !== snapshot.splits[index]?.clientId || row.percent !== snapshot.splits[index]?.percent) ||
        draftActivities.length > 0 ||
        draftAliases.length > 0;
    function invalidReason() {
        if (!name.trim())
            return 'Project needs a name.';
        if (splits.length === 0)
            return null;
        if (!uniqueClients)
            return 'Each client can only appear once.';
        if (noSplit)
            return null;
        if (total !== 100)
            return `Client splits must sum to 100, currently ${total}.`;
        return null;
    }
    async function save() {
        const targetWorkspaceId = editing?.workspace_id ?? createWorkspaceId;
        if (!targetWorkspaceId) {
            const msg = 'Choose a workspace.';
            setSaveHint(msg);
            toast({ tone: 'error', title: 'Could not save project', description: msg });
            return;
        }
        const reason = invalidReason();
        if (reason) {
            setSaveHint(reason);
            toast({ tone: 'error', title: 'Could not save project', description: reason });
            return;
        }
        setSaveHint(null);
        onError(null);
        setSaving(true);
        const payload = {
            name: name.trim(),
            description: description.trim(),
            color,
            billable,
            hourly_rate: rate.trim() === '' ? null : Number(rate),
            currency,
        };
        try {
            let saved;
            if (editing) {
                const { data, error } = await supabase.from('projects').update(payload).eq('id', editing.id).select('*').single();
                if (error)
                    throw error;
                saved = data;
            }
            else {
                const { data, error } = await supabase
                    .from('projects')
                    .insert({ workspace_id: targetWorkspaceId, ...payload })
                    .select('*')
                    .single();
                if (error)
                    throw error;
                saved = data;
            }
            qc.setQueryData(qk.projects(catalogWorkspaceId), (current) => {
                const list = current ?? [];
                const index = list.findIndex((item) => item.id === saved.id);
                if (index >= 0) {
                    const next = [...list];
                    next[index] = saved;
                    return next;
                }
                return [...list, saved];
            });
            const { data: links, error: splitErr } = await supabase.rpc('replace_project_clients', {
                p_project_id: saved.id,
                p_splits: splits.map((row) => ({ client_id: row.clientId, split_percent: row.percent })),
            });
            if (splitErr)
                throw splitErr;
            qc.setQueryData(qk.projectClients(catalogWorkspaceId), (current) => {
                const rest = (current ?? []).filter((row) => row.project_id !== saved.id);
                return [...rest, ...(links ?? [])];
            });
            const nextSnap = {
                name: saved.name,
                description: saved.description,
                color: saved.color,
                billable: saved.billable,
                rate: saved.hourly_rate != null ? String(saved.hourly_rate) : '',
                currency: saved.currency ?? 'SEK',
                splits: splits.map((row) => ({ ...row })),
            };
            setEditing(saved);
            setName(nextSnap.name);
            setDescription(nextSnap.description);
            setColor(nextSnap.color);
            setBillable(nextSnap.billable);
            setRate(nextSnap.rate);
            setCurrency(nextSnap.currency);
            setSplits(nextSnap.splits);
            setSnapshot(nextSnap);
            const leftoverActivities = [];
            let draftError = null;
            for (const item of draftActivities) {
                if (draftError) {
                    leftoverActivities.push(item);
                    continue;
                }
                const { data, error } = await supabase
                    .from('activities')
                    .insert({ workspace_id: saved.workspace_id, project_id: saved.id, client_id: null, name: item })
                    .select('*')
                    .single();
                if (error) {
                    draftError = failMessage(error);
                    leftoverActivities.push(item);
                }
                else if (data) {
                    qc.setQueryData(qk.activities(catalogWorkspaceId), (current) => [...(current ?? []), data]);
                }
            }
            const leftoverAliases = [];
            for (const item of draftAliases) {
                if (draftError) {
                    leftoverAliases.push(item);
                    continue;
                }
                const { data, error } = await supabase
                    .from('project_aliases')
                    .insert({ workspace_id: saved.workspace_id, project_id: saved.id, shortcut: item })
                    .select('*')
                    .single();
                if (error) {
                    draftError = failMessage(error);
                    leftoverAliases.push(item);
                }
                else if (data) {
                    qc.setQueryData(qk.aliases(catalogWorkspaceId), (current) => [
                        ...(current ?? []),
                        data,
                    ]);
                }
            }
            setDraftActivities(leftoverActivities);
            setDraftAliases(leftoverAliases);
            onSaved();
            if (draftError)
                throw new Error(draftError);
            toast({ tone: 'success', title: 'Project saved', description: saved.name });
        }
        catch (err) {
            const msg = failMessage(err);
            setSaveHint(msg);
            toast({ tone: 'error', title: 'Could not save project', description: msg });
        }
        finally {
            setSaving(false);
        }
    }
    async function remove() {
        if (!editing || confirmName !== editing.name)
            return;
        try {
            const { error } = await supabase.rpc('delete_project', { p_project_id: editing.id });
            if (error)
                throw error;
            const removedId = editing.id;
            const removedName = editing.name;
            qc.setQueryData(qk.projects(catalogWorkspaceId), (current) => (current ?? []).filter((item) => item.id !== removedId));
            setConfirmOpen(false);
            setConfirmName('');
            load();
            await Promise.all([
                qc.invalidateQueries({ queryKey: qk.entries(catalogWorkspaceId) }),
                qc.invalidateQueries({ queryKey: qk.requests(catalogWorkspaceId) }),
                qc.invalidateQueries({ queryKey: qk.activities(catalogWorkspaceId) }),
                qc.invalidateQueries({ queryKey: qk.aliases(catalogWorkspaceId) }),
                qc.invalidateQueries({ queryKey: qk.projectClients(catalogWorkspaceId) }),
                qc.invalidateQueries({ queryKey: qk.running }),
            ]);
            toast({ tone: 'success', title: 'Project deleted', description: removedName });
        }
        catch (err) {
            toast({ tone: 'error', title: 'Could not delete project', description: failMessage(err) });
        }
    }
    return (_jsxs("div", { className: "grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]", children: [_jsx("ul", { className: "min-h-0 h-full overflow-y-auto rounded-lg border border-border", children: catalog.allProjects.length === 0 ? (_jsx("li", { className: "px-3 py-3 text-sm text-muted-foreground", children: "No projects yet. Use New project." })) : (catalog.allProjects.map((project) => {
                    const chips = catalog.projectClients
                        .filter((row) => row.project_id === project.id)
                        .map((row) => {
                        const client = catalog.clients.find((item) => item.id === row.client_id);
                        const name = client?.name ?? 'Client';
                        return {
                            name,
                            label: row.split_percent == null ? name : `${name} ${Number(row.split_percent)}%`,
                        };
                    })
                        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
                    const selected = editing?.id === project.id;
                    return (_jsx("li", { className: "border-t border-border first:border-t-0", children: _jsxs("button", { type: "button", className: cn('block w-full px-3 py-2.5 text-left', selected && 'bg-muted'), onClick: () => load(project), children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "size-2.5 shrink-0 rounded-sm", style: { background: project.color }, "aria-hidden": "true" }), _jsx("span", { className: "truncate text-sm font-medium leading-5", children: project.name }), project.description ? (_jsx("span", { className: "min-w-0 truncate text-sm leading-5 text-muted-foreground", children: project.description })) : null] }), _jsx("p", { className: "mt-1 min-h-4 font-mono text-[11px] leading-4 tabular-nums text-muted-foreground", children: chips.map((chip) => chip.label).join(' · ') })] }) }, project.id));
                })) }), _jsxs("div", { className: "h-full min-h-0 overflow-y-auto rounded-lg border border-border bg-card p-4", children: [_jsx("p", { className: "text-[11px] font-medium tracking-[0.08em] text-muted-foreground", children: editing ? 'PROJECT' : 'NEW PROJECT' }), !canManage ? _jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: "View only." }) : null, _jsxs("div", { className: "mt-4 grid gap-1.5", children: [_jsx(Label, { htmlFor: "pname", children: "Name" }), _jsx(Input, { id: "pname", value: name, onChange: (e) => setName(e.target.value), disabled: !canManage })] }), _jsxs("div", { className: "mt-3 grid gap-1.5", children: [_jsx(Label, { htmlFor: "pdesc", children: "Description" }), _jsx(Input, { id: "pdesc", value: description, onChange: (e) => setDescription(e.target.value), disabled: !canManage, placeholder: "Optional" })] }), _jsxs("div", { className: "mt-4", children: [_jsx("p", { className: "mb-2 text-sm font-medium", children: "Aliases" }), canManage ? (_jsxs("form", { className: "mb-2 flex h-9 items-center gap-2", onSubmit: async (e) => {
                                    e.preventDefault();
                                    const value = shortcut.trim();
                                    if (!value)
                                        return;
                                    if (!editing) {
                                        if (draftAliases.some((item) => item.toLowerCase() === value.toLowerCase()))
                                            return;
                                        setDraftAliases((rows) => [...rows, value]);
                                        setShortcut('');
                                        return;
                                    }
                                    const { error } = await supabase.from('project_aliases').insert({
                                        workspace_id: editing.workspace_id,
                                        project_id: editing.id,
                                        shortcut: value,
                                    });
                                    if (error) {
                                        toast({ tone: 'error', title: 'Could not add alias', description: failMessage(error) });
                                        return;
                                    }
                                    setShortcut('');
                                    onSaved();
                                    toast({ tone: 'success', title: 'Alias added', description: value });
                                }, children: [_jsx(Input, { className: "h-9 min-w-0 flex-1 font-mono", value: shortcut, onChange: (e) => setShortcut(e.target.value), placeholder: "Shortcut" }), _jsx(Button, { type: "submit", className: "h-9", disabled: !shortcut.trim(), children: "Add" })] })) : null, (editing ? catalog.aliases.filter((row) => row.project_id === editing.id) : []).length === 0 &&
                                draftAliases.length === 0 ? (_jsx("p", { className: "text-sm text-muted-foreground", children: "No aliases yet." })) : (_jsxs("div", { className: "flex flex-wrap gap-1.5", children: [editing
                                        ? catalog.aliases
                                            .filter((row) => row.project_id === editing.id)
                                            .map((alias) => (_jsx(AliasChip, { shortcut: alias.shortcut, canManage: canManage, onRename: () => setRenamingAlias({ id: alias.id, shortcut: alias.shortcut }), onDelete: () => setPendingAlias({ id: alias.id, shortcut: alias.shortcut }) }, alias.id)))
                                        : null, draftAliases.map((item) => (_jsx(AliasChip, { shortcut: item, canManage: canManage, onRename: () => setRenamingAlias({ draft: item }), onDelete: () => setPendingAlias({ draft: item }) }, `draft-${item}`)))] }))] }), _jsxs("div", { className: "mt-3 grid gap-1.5", children: [_jsx(Label, { children: "Color" }), _jsxs("div", { className: "flex flex-wrap items-center gap-1.5", children: [SWATCHES.map((swatch) => (_jsx("button", { type: "button", "aria-label": swatch, "aria-pressed": color.toUpperCase() === swatch.toUpperCase(), disabled: !canManage, className: cn('size-6 rounded-sm', color.toUpperCase() === swatch.toUpperCase() ? 'outline outline-1 outline-offset-1 outline-foreground' : ''), style: { background: swatch }, onClick: () => setColor(swatch) }, swatch))), _jsxs("button", { type: "button", disabled: !canManage, className: "relative size-6 overflow-hidden rounded-sm border border-border", "aria-label": "Custom color", onClick: () => picker.current?.click(), children: [_jsx("span", { className: "absolute inset-0", style: { background: color } }), _jsx("input", { ref: picker, type: "color", value: color, disabled: !canManage, className: "absolute inset-0 cursor-pointer opacity-0", onChange: (e) => setColor(e.target.value) })] })] })] }), _jsxs("div", { className: "mt-4 flex h-9 items-center overflow-hidden rounded-md border border-input bg-background", children: [_jsxs("div", { className: "flex h-full shrink-0 items-center gap-2 border-r border-input px-3", children: [_jsx(Switch, { checked: billable, onCheckedChange: setBillable, disabled: !canManage, id: "pbill" }), _jsx(Label, { htmlFor: "pbill", children: "Billable" })] }), _jsx(Input, { id: "prate", className: "h-9 min-w-0 flex-1 rounded-none border-0 bg-transparent tabular-nums shadow-none focus-visible:ring-0", type: "number", min: 0, step: 0.01, value: rate, disabled: !canManage, placeholder: "Rate", "aria-label": "Hourly rate", onChange: (e) => setRate(e.target.value) }), _jsxs(Select, { value: currency, onValueChange: setCurrency, disabled: !canManage, children: [_jsx(SelectTrigger, { className: "h-9 w-[4.75rem] shrink-0 rounded-none border-0 border-l border-input bg-transparent", "aria-label": "Currency", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: CURRENCIES.map((code) => (_jsx(SelectItem, { value: code, children: code }, code))) })] })] }), _jsxs("div", { className: "mt-4", children: [_jsxs("p", { className: "mb-2 flex items-center gap-1.5 text-sm font-medium", children: ["Clients (", splits.length === 0 ? 'none' : noSplit ? 'no split' : `${total}%`, ")", _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { type: "button", className: "inline-flex text-muted-foreground", "aria-label": "About clients", children: _jsx(InformationCircleIcon, { className: "size-4" }) }) }), _jsx(TooltipContent, { children: "A percentage split automatically assigns every log on this project to these clients. No split means you pick the client on each time entry, and each chosen client keeps the full hour. Leave clients empty for a personal or internal project." })] })] }), _jsxs("div", { className: "mb-2 flex flex-wrap gap-2", children: [_jsx(Button, { type: "button", size: "sm", variant: noSplit ? 'default' : 'outline', disabled: !canManage, onClick: () => setSplits((current) => current.map((row) => ({ ...row, percent: null }))), children: "No split" }), PRESETS.map((preset) => {
                                        const selected = !noSplit &&
                                            splits.length === preset.parts.length &&
                                            splits.every((row, i) => row.percent === preset.parts[i]);
                                        return (_jsx(Button, { type: "button", size: "sm", variant: selected ? 'default' : 'outline', disabled: !canManage || splits.length !== preset.parts.length, onClick: () => setSplits((current) => current.map((row, i) => ({ ...row, percent: preset.parts[i] ?? row.percent }))), children: preset.label }, preset.label));
                                    })] }), splits.map((split, index) => (_jsxs("div", { className: "mb-2 flex gap-2", children: [_jsxs(Select, { value: split.clientId, disabled: !canManage, onValueChange: (value) => setSplits((rows) => rows.map((row, i) => (i === index ? { ...row, clientId: value } : row))), children: [_jsx(SelectTrigger, { className: "w-2/5", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: workspaceClients.map((client) => (_jsx(SelectItem, { value: client.id, children: client.name }, client.id))) })] }), noSplit ? null : (_jsxs("div", { className: "relative w-24", children: [_jsx(Input, { className: "w-24 pr-7", type: "number", min: 0.01, max: 100, step: 0.01, value: split.percent ?? '', disabled: !canManage, onChange: (e) => setSplits((rows) => rows.map((row, i) => (i === index ? { ...row, percent: Number(e.target.value) } : row))) }), _jsx("span", { className: "pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground", children: "%" })] })), canManage ? (_jsx(Button, { type: "button", variant: "ghost", onClick: () => setSplits((rows) => rows.filter((_, i) => i !== index)), children: "Remove" })) : null] }, `${split.clientId}-${index}`))), canManage ? (_jsx(Button, { type: "button", variant: "outline", size: "sm", onClick: () => {
                                    const next = workspaceClients.find((client) => !splits.some((row) => row.clientId === client.id));
                                    if (!next)
                                        return;
                                    setSplits((rows) => [
                                        ...rows,
                                        { clientId: next.id, percent: noSplit ? null : rows.length === 0 ? 100 : 0 },
                                    ]);
                                }, children: "Add client" })) : null] }), _jsxs("div", { className: "mt-4", children: [_jsx("p", { className: "mb-2 text-sm font-medium", children: "Activities" }), canManage ? (_jsxs("form", { className: "mb-2 flex h-9 items-center gap-2", onSubmit: async (e) => {
                                    e.preventDefault();
                                    const value = activityName.trim();
                                    if (!value)
                                        return;
                                    if (!editing) {
                                        if (draftActivities.some((item) => item.toLowerCase() === value.toLowerCase()))
                                            return;
                                        setDraftActivities((rows) => [...rows, value]);
                                        setActivityName('');
                                        return;
                                    }
                                    const { error } = await supabase.from('activities').insert({
                                        workspace_id: editing.workspace_id,
                                        project_id: editing.id,
                                        client_id: null,
                                        name: value,
                                    });
                                    if (error) {
                                        toast({ tone: 'error', title: 'Could not add activity', description: failMessage(error) });
                                        return;
                                    }
                                    setActivityName('');
                                    onSaved();
                                }, children: [_jsx(Input, { className: "h-9 min-w-0 flex-1", value: activityName, onChange: (e) => setActivityName(e.target.value), placeholder: "Activity name" }), _jsx(Button, { type: "submit", className: "h-9", disabled: !activityName.trim(), children: "Add" })] })) : null, (editing
                                ? catalog.activities.filter((row) => row.project_id === editing.id && row.client_id == null)
                                : []).length === 0 && draftActivities.length === 0 ? (_jsx("p", { className: "text-sm text-muted-foreground", children: "No project activities yet." })) : (_jsxs("ul", { children: [editing
                                        ? catalog.activities
                                            .filter((row) => row.project_id === editing.id && row.client_id == null)
                                            .map((activity) => (_jsxs("li", { className: "flex items-center gap-2 py-1.5 text-sm", children: [_jsx("span", { className: "min-w-0 flex-1 truncate", children: activity.name }), activity.is_default ? _jsx(Badge, { variant: "secondary", children: "Default" }) : null, canManage ? (_jsxs(_Fragment, { children: [_jsx(ActivityRowMenu, { isDefault: activity.is_default, onRename: () => setRenaming(activity), onMove: () => setMoving(activity), onToggleDefault: () => void setActivityDefault(activity, onSaved) }), _jsx(RemoveActivityButton, { onClick: () => setPendingActivity({ id: activity.id, name: activity.name }) })] })) : null] }, activity.id)))
                                        : null, draftActivities.map((item) => (_jsxs("li", { className: "flex items-center gap-2 py-1.5 text-sm", children: [_jsx("span", { className: "min-w-0 flex-1 truncate", children: item }), canManage ? (_jsxs(_Fragment, { children: [_jsx(ActivityRowMenu, { onRename: () => setRenamingDraft(item) }), _jsx(RemoveActivityButton, { onClick: () => setPendingActivity({ draft: item }) })] })) : null] }, `draft-${item}`)))] }))] }), _jsxs("div", { className: "mt-4", children: [_jsx("p", { className: "mb-2 text-sm font-medium", children: "From clients" }), clientActivityGroups.length === 0 ? (_jsx("p", { className: "text-sm text-muted-foreground", children: "No client activities on this project." })) : (_jsx("div", { className: "grid gap-2", children: clientActivityGroups.map((group) => (_jsxs("div", { children: [_jsx("p", { className: "text-xs font-medium text-muted-foreground", children: group.name }), _jsx("ul", { children: group.activities.map((activity) => (_jsx("li", { className: "truncate py-1 text-sm", children: activity.name }, activity.id))) })] }, group.id))) }))] }), canManage ? (_jsxs("div", { className: "mt-4 flex flex-wrap items-center gap-2", children: [editing ? (_jsx(Button, { variant: "destructive", onClick: () => {
                                    setConfirmName('');
                                    setConfirmOpen(true);
                                }, children: "Delete project" })) : null, _jsx(Button, { className: "ml-auto", onClick: () => void save(), disabled: !projectDirty, loading: saving, children: "Save project" }), saveHint ? _jsx("p", { className: "mt-0 basis-full text-sm text-destructive", children: saveHint }) : null] })) : null, _jsx(ActivityRenameDialog, { activity: renaming, open: Boolean(renaming), onOpenChange: (open) => {
                            if (!open)
                                setRenaming(null);
                        }, onSaved: onSaved }), _jsx(ActivityMoveDialog, { activity: moving, projects: catalog.allProjects.filter((project) => project.workspace_id === moving?.workspace_id), clients: catalog.clients.filter((client) => client.workspace_id === moving?.workspace_id), open: Boolean(moving), onOpenChange: (open) => {
                            if (!open)
                                setMoving(null);
                        }, onSaved: onSaved }), _jsx(DraftRenameDialog, { current: renamingDraft, open: Boolean(renamingDraft), onOpenChange: (open) => {
                            if (!open)
                                setRenamingDraft(null);
                        }, onSave: (next) => {
                            const previous = renamingDraft;
                            if (!previous)
                                return false;
                            if (draftActivities.some((item) => item !== previous && item.toLowerCase() === next.toLowerCase())) {
                                toast({ tone: 'error', title: 'Could not rename activity', description: 'An activity with this name already exists.' });
                                return false;
                            }
                            setDraftActivities((rows) => rows.map((row) => (row === previous ? next : row)));
                            return true;
                        } }), _jsx(DraftRenameDialog, { current: renamingAlias ? ('draft' in renamingAlias ? renamingAlias.draft : renamingAlias.shortcut) : null, open: Boolean(renamingAlias), title: "Rename alias", placeholder: "Shortcut", onOpenChange: (open) => {
                            if (!open)
                                setRenamingAlias(null);
                        }, onSave: async (next) => {
                            const current = renamingAlias;
                            if (!current)
                                return false;
                            if ('draft' in current) {
                                if (draftAliases.some((item) => item !== current.draft && item.toLowerCase() === next.toLowerCase())) {
                                    toast({ tone: 'error', title: 'Could not rename alias', description: 'An alias with this shortcut already exists.' });
                                    return false;
                                }
                                setDraftAliases((rows) => rows.map((row) => (row === current.draft ? next : row)));
                                return true;
                            }
                            const { error } = await supabase.from('project_aliases').update({ shortcut: next }).eq('id', current.id);
                            if (error) {
                                toast({ tone: 'error', title: 'Could not rename alias', description: failMessage(error) });
                                return false;
                            }
                            onSaved();
                            return true;
                        } }), _jsx(ConfirmDeleteDialog, { name: pendingAlias ? ('draft' in pendingAlias ? pendingAlias.draft : pendingAlias.shortcut) : null, open: Boolean(pendingAlias), onOpenChange: (open) => {
                            if (!open)
                                setPendingAlias(null);
                        }, onConfirm: () => {
                            if (!pendingAlias)
                                return;
                            if ('draft' in pendingAlias) {
                                const shortcut = pendingAlias.draft;
                                setPendingAlias(null);
                                setDraftAliases((rows) => rows.filter((row) => row !== shortcut));
                                return;
                            }
                            const id = pendingAlias.id;
                            setPendingAlias(null);
                            void (async () => {
                                const { error } = await supabase.from('project_aliases').delete().eq('id', id);
                                if (error) {
                                    toast({ tone: 'error', title: 'Could not delete alias', description: failMessage(error) });
                                    return;
                                }
                                onSaved();
                            })();
                        } }), _jsx(ConfirmDeleteDialog, { name: pendingActivity ? ('draft' in pendingActivity ? pendingActivity.draft : pendingActivity.name) : null, open: Boolean(pendingActivity), onOpenChange: (open) => {
                            if (!open)
                                setPendingActivity(null);
                        }, onConfirm: () => {
                            if (!pendingActivity)
                                return;
                            if ('draft' in pendingActivity) {
                                const name = pendingActivity.draft;
                                setPendingActivity(null);
                                setDraftActivities((rows) => rows.filter((row) => row !== name));
                                return;
                            }
                            const id = pendingActivity.id;
                            setPendingActivity(null);
                            void deleteActivity(id, onSaved);
                        } }), _jsx(Dialog, { open: confirmOpen, onOpenChange: (open) => {
                            setConfirmOpen(open);
                            if (!open)
                                setConfirmName('');
                        }, children: _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsxs(DialogTitle, { className: "font-bold text-destructive", children: ["Delete ", editing?.name, "?"] }), _jsxs(DialogDescription, { children: ["Time entries, aliases, and activities on this project are removed, including client activities here. Clients and their activities on other projects stay.", _jsx("span", { className: "mt-2 block text-destructive", children: "This action is irreversible." })] })] }), _jsxs("div", { className: "grid gap-1.5", children: [_jsxs(Label, { htmlFor: "confirm-project", children: ["Type ", _jsx("span", { className: "text-destructive", children: editing?.name }), " project to confirm"] }), _jsx(Input, { id: "confirm-project", value: confirmName, onChange: (e) => setConfirmName(e.target.value), autoComplete: "off" })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { type: "button", variant: "outline", onClick: () => {
                                                setConfirmOpen(false);
                                                setConfirmName('');
                                            }, children: "Cancel" }), _jsx(Button, { type: "button", variant: "destructive", disabled: !editing || confirmName !== editing.name, onClick: () => void remove(), children: "Delete" })] })] }) })] })] }));
}
