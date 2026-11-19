import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Pause } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { EntryMetaChips } from '@/components/timer/entry-editor';
import { QuickStartMenu } from '@/components/timer/quick-start-menu';
import { WorkspaceMark } from '@/components/workspaces/workspace-icon';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { useCatalog } from '@/features/projects/use-catalog';
import { useNow } from '@/features/timer/use-now';
import { useRunningTimer } from '@/features/timer/use-running-timer';
import { useWorkspace } from '@/features/workspaces/workspace-context';
import { qk } from '@/lib/query-keys';
import { formatDuration } from '@/lib/splits';
import { supabase } from '@/lib/supabase';
import { startTimer, updateEntryDescription, updateRunningEntry } from '@/lib/timer';
import { cn } from '@/lib/utils';
export function RunningBanner({ onPresenceChange }) {
    const { data: running } = useRunningTimer();
    const [shown, setShown] = useState(running ?? null);
    const [open, setOpen] = useState(Boolean(running));
    const { workspaceId, isAll, workspaces } = useWorkspace();
    const catalog = useCatalog();
    const now = useNow(Boolean(running));
    const qc = useQueryClient();
    useEffect(() => {
        if (running) {
            setShown(running);
            setOpen(true);
        }
        else {
            setOpen(false);
        }
    }, [running]);
    useEffect(() => {
        onPresenceChange?.(Boolean(shown));
    }, [shown, onPresenceChange]);
    useEffect(() => {
        if (open || !shown)
            return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setShown(null);
            return;
        }
        const timer = window.setTimeout(() => setShown(null), 160);
        return () => window.clearTimeout(timer);
    }, [open, shown]);
    const otherWorkspace = Boolean(shown && !isAll && shown.workspace_id !== workspaceId);
    const otherId = otherWorkspace && shown ? shown.workspace_id : null;
    const otherProjects = useQuery({
        queryKey: qk.projects(otherId ?? 'running-other'),
        enabled: Boolean(otherId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('projects')
                .select('*')
                .eq('workspace_id', otherId)
                .order('name');
            if (error)
                throw error;
            return (data ?? []).filter((project) => !project.archived);
        },
    });
    const otherActivities = useQuery({
        queryKey: qk.activities(otherId ?? 'running-other'),
        enabled: Boolean(otherId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('activities')
                .select('*')
                .eq('workspace_id', otherId)
                .order('name');
            if (error)
                throw error;
            return (data ?? []);
        },
    });
    const otherClients = useQuery({
        queryKey: qk.clients(otherId ?? 'running-other'),
        enabled: Boolean(otherId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('clients')
                .select('*')
                .eq('workspace_id', otherId)
                .order('name');
            if (error)
                throw error;
            return (data ?? []);
        },
    });
    const otherProjectClients = useQuery({
        queryKey: qk.projectClients(otherId ?? 'running-other'),
        enabled: Boolean(otherId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('project_clients')
                .select('*, client:clients(*)')
                .eq('workspace_id', otherId);
            if (error)
                throw error;
            return (data ?? []);
        },
    });
    const refresh = () => {
        void qc.invalidateQueries({ queryKey: qk.running });
        void qc.invalidateQueries({ queryKey: ['entries'] });
    };
    const stop = useMutation({
        mutationFn: async () => {
            const { error } = await supabase.rpc('stop_running_timer');
            if (error)
                throw error;
        },
        onSuccess: refresh,
        onError: (err) => toast({ tone: 'error', title: 'Could not stop tracking', description: err.message }),
    });
    const quickStart = useMutation({
        mutationFn: startTimer,
        onSuccess: refresh,
        onError: (err) => toast({ tone: 'error', title: 'Could not switch tracking', description: err.message }),
    });
    const describe = useMutation({
        mutationFn: (input) => updateEntryDescription(input.id, input.description),
        onSuccess: refresh,
    });
    const assignRunning = useMutation({
        mutationFn: (input) => {
            if (!shown)
                throw new Error('No running timer');
            return updateRunningEntry({
                id: shown.id,
                workspaceId: shown.workspace_id,
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
    });
    if (!shown)
        return null;
    const elapsed = Math.floor((now - new Date(shown.started_at).getTime()) / 1000);
    const runningWorkspace = workspaces.find((workspace) => workspace.id === shown.workspace_id);
    const workspaceName = runningWorkspace?.name ?? 'Workspace';
    const projects = (otherWorkspace ? (otherProjects.data ?? []) : catalog.projects).filter((project) => project.workspace_id === shown.workspace_id);
    const activities = otherWorkspace ? (otherActivities.data ?? []) : catalog.activities;
    const clients = otherWorkspace ? (otherClients.data ?? []) : catalog.clients;
    const projectClients = otherWorkspace ? (otherProjectClients.data ?? []) : catalog.projectClients;
    return (_jsxs("div", { className: "running-banner sticky top-0 z-20", children: [_jsx("div", { className: cn('grid transition-[grid-template-rows] duration-150 ease-out motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'), onTransitionEnd: (event) => {
                    if (event.target !== event.currentTarget || event.propertyName !== 'grid-template-rows')
                        return;
                    if (!open)
                        setShown(null);
                }, children: _jsx("div", { className: cn('min-h-0 overflow-hidden', !open && 'pointer-events-none'), children: _jsxs("div", { className: "flex items-center gap-2 border-b border-border bg-accent/70 px-4 py-3 text-sm backdrop-blur-md md:px-6", children: [_jsxs("div", { className: "flex min-w-0 flex-1 items-center gap-2", children: [otherWorkspace ? (_jsxs("span", { className: "inline-flex h-8 max-w-40 shrink-0 items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2.5 text-sm", children: [_jsx(WorkspaceMark, { icon: runningWorkspace?.icon }), _jsx("span", { className: "truncate", children: workspaceName })] })) : null, _jsx(EntryMetaChips, { workspaceId: shown.workspace_id, projectId: shown.project_id ?? '', activityId: shown.activity_id ?? '', clientIds: shown.time_entry_clients?.map((row) => row.client_id) ?? [], requestIds: shown.time_entry_requests?.map((row) => row.request_id) ?? [], taskIds: shown.time_entry_tasks?.map((row) => row.task_id) ?? [], description: shown.description, billable: shown.billable, projects: projects, activities: activities, clients: clients, projectClients: projectClients, onChange: (next) => assignRunning.mutate(next) }), _jsx("input", { "aria-label": "Description", defaultValue: shown.description, placeholder: "Description", className: "h-9 min-w-0 flex-1 rounded-md bg-transparent px-1 text-sm outline-none transition-colors duration-75 hover:bg-muted placeholder:text-muted-foreground", onKeyDown: (event) => {
                                            if (event.key === 'Enter') {
                                                event.preventDefault();
                                                event.currentTarget.blur();
                                            }
                                        }, onBlur: (event) => {
                                            if (event.target.value !== shown.description) {
                                                describe.mutate({ id: shown.id, description: event.target.value });
                                            }
                                        } }, `${shown.id}:${shown.description}`)] }), _jsx("span", { className: "tabular shrink-0 font-semibold", children: formatDuration(elapsed) }), _jsxs("div", { className: "flex", children: [_jsxs(Button, { className: "rounded-r-none", variant: "outline", onClick: () => stop.mutate(), disabled: stop.isPending || quickStart.isPending, children: [_jsx(Pause, { "aria-hidden": "true" }), "Stop"] }), _jsx(QuickStartMenu, { label: "Quick switch", variant: "outline", pending: stop.isPending || quickStart.isPending, projects: catalog.projects.filter((project) => (isAll ? true : project.workspace_id === workspaceId)), activities: catalog.activities, clients: catalog.clients, projectClients: catalog.projectClients, onSelect: (input) => quickStart.mutate({
                                            workspaceId: input.workspaceId,
                                            projectId: input.projectId,
                                            billable: input.billable,
                                            description: input.description,
                                            activityId: input.activityId,
                                            clientIds: input.clientIds,
                                        }) })] })] }) }) }), _jsx("div", { className: "pointer-events-none h-4 md:h-6", "aria-hidden": "true" })] }));
}
