import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, } from '@/components/ui/dropdown-menu';
import { clientMode } from '@/components/timer/entry-editor';
export function QuickStartMenu({ projects, activities, clients, projectClients, pending, variant = 'default', label, onSelect, }) {
    const groups = activityGroups(projects, activities, clients);
    const showActivitySection = groups.length > 0;
    const chevronClass = variant === 'outline'
        ? 'rounded-l-none border-l-0 px-2'
        : 'rounded-l-none border-l border-primary-foreground/30 px-2';
    return (_jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsx(Button, { className: chevronClass, variant: variant, "aria-label": label, disabled: pending, children: _jsx(ChevronDownIcon, { "aria-hidden": "true" }) }) }), _jsxs(DropdownMenuContent, { align: "end", className: "w-64", children: [_jsx(DropdownMenuLabel, { children: "Projects" }), projects.length === 0 ? (_jsx(DropdownMenuItem, { disabled: true, children: "No projects yet" })) : (projects.map((project) => (_jsxs(DropdownMenuItem, { onSelect: () => onSelect({
                            workspaceId: project.workspace_id,
                            projectId: project.id,
                            billable: project.billable,
                            description: '',
                        }), children: [_jsx("span", { className: "size-2 shrink-0", style: { background: project.color }, "aria-hidden": "true" }), project.name] }, project.id)))), showActivitySection ? (_jsxs(_Fragment, { children: [_jsx(DropdownMenuSeparator, {}), groups.map((group) => (_jsxs(DropdownMenuGroup, { children: [group.name ? _jsx(DropdownMenuLabel, { children: group.name }) : null, group.rows.map(({ activity, project }) => (_jsxs(DropdownMenuItem, { onSelect: () => {
                                            const links = projectClients.filter((row) => row.project_id === project.id);
                                            const clientIds = clientMode(links) === 'manual' && activity.client_id ? [activity.client_id] : [];
                                            onSelect({
                                                workspaceId: project.workspace_id,
                                                projectId: project.id,
                                                billable: project.billable,
                                                description: '',
                                                activityId: activity.id,
                                                clientIds,
                                            });
                                        }, children: [_jsx("span", { className: "size-2 shrink-0", style: { background: project.color }, "aria-hidden": "true" }), _jsx("span", { className: "min-w-0 truncate", children: activity.name })] }, activity.id)))] }, group.id)))] })) : null] })] }));
}
function activityGroups(projects, activities, clients) {
    const rows = activities.flatMap((activity) => {
        const project = projects.find((item) => item.id === activity.project_id);
        if (!project)
            return [];
        const client = activity.client_id ? clients.find((item) => item.id === activity.client_id) : null;
        return [{ activity, project, client }];
    });
    const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
    rows.sort((a, b) => byName(a.project.name, b.project.name) || byName(a.activity.name, b.activity.name));
    const named = new Map();
    const unassigned = [];
    for (const row of rows) {
        if (!row.client) {
            unassigned.push(row);
            continue;
        }
        const group = named.get(row.client.id) ?? { id: row.client.id, name: row.client.name, rows: [] };
        group.rows.push(row);
        named.set(row.client.id, group);
    }
    const groups = [...named.values()].sort((a, b) => byName(a.name, b.name));
    if (unassigned.length > 0)
        groups.push({ id: 'unassigned', name: '', rows: unassigned });
    return groups;
}
