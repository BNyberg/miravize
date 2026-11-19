function clientMode(links) {
    if (links.length === 0)
        return 'none';
    if (links.every((row) => row.split_percent == null))
        return 'manual';
    return 'auto';
}
function projectLinks(catalog, projectId) {
    return catalog.projectClients.filter((row) => row.project_id === projectId);
}
function splitClientIds(catalog, projectId) {
    const links = projectLinks(catalog, projectId);
    if (clientMode(links) !== 'auto')
        return [];
    return [...new Set(links.map((row) => row.client_id))];
}
function sameIds(a, b) {
    if (a.length !== b.length)
        return false;
    const set = new Set(a);
    return b.every((id) => set.has(id));
}
export const emptyAssignment = () => ({
    projectId: '',
    activityId: '',
    clientIds: [],
});
export function displayClientIds(row, catalog) {
    const stored = (row.request_clients ?? row.task_clients)?.map((item) => item.client_id) ?? [];
    if (stored.length > 0)
        return stored;
    if (!row.project_id)
        return [];
    return splitClientIds(catalog, row.project_id);
}
export function assignmentClientMode(catalog, projectId) {
    if (!projectId)
        return 'none';
    return clientMode(projectLinks(catalog, projectId));
}
export function applyProject(current, nextProjectId, catalog) {
    if (!nextProjectId)
        return emptyAssignment();
    const nextLinks = projectLinks(catalog, nextProjectId);
    const nextMode = clientMode(nextLinks);
    const keptActivity = catalog.activities.find((row) => row.id === current.activityId && row.project_id === nextProjectId);
    const defaultActivity = catalog.activities.find((row) => row.project_id === nextProjectId && row.client_id == null && row.is_default);
    const allowed = new Set(nextLinks.map((row) => row.client_id));
    return {
        projectId: nextProjectId,
        activityId: keptActivity?.id ?? defaultActivity?.id ?? '',
        clientIds: nextMode === 'auto'
            ? [...allowed]
            : nextMode === 'manual'
                ? current.clientIds.filter((id) => allowed.has(id))
                : [],
    };
}
export function applyActivity(current, nextActivityId, catalog) {
    const nextActivity = catalog.activities.find((row) => row.id === nextActivityId);
    if (!nextActivity) {
        return { ...current, activityId: '' };
    }
    let next = current;
    if (nextActivity.project_id !== current.projectId) {
        next = applyProject(current, nextActivity.project_id, catalog);
    }
    let nextClients = next.clientIds;
    if (nextActivity.client_id && !nextClients.includes(nextActivity.client_id)) {
        nextClients = [...nextClients, nextActivity.client_id];
    }
    return {
        ...next,
        activityId: nextActivityId,
        clientIds: nextClients,
    };
}
export function applyClients(current, clientIds, catalog) {
    if (!current.projectId)
        return { ...current, clientIds };
    const required = splitClientIds(catalog, current.projectId);
    if (required.length === 0 || sameIds(required, clientIds)) {
        return { ...current, clientIds };
    }
    return { ...current, projectId: '', activityId: '', clientIds };
}
function same(a, b) {
    return a.toLowerCase() === b.toLowerCase();
}
function compact(value) {
    return value.replace(/\s+/g, '');
}
export function resolveMention(value, catalog) {
    const alias = catalog.aliases.find((row) => same(row.shortcut, value) || same(compact(row.shortcut), value));
    if (alias) {
        const project = catalog.projects.find((row) => row.id === alias.project_id);
        if (project)
            return { kind: 'project', id: project.id, token: value, label: project.name, color: project.color };
    }
    const activity = catalog.activities.find((row) => same(row.name, value) || same(compact(row.name), value));
    if (activity)
        return { kind: 'activity', id: activity.id, token: value, label: activity.name };
    const project = catalog.projects.find((row) => same(row.name, value) || same(compact(row.name), value));
    if (project)
        return { kind: 'project', id: project.id, token: value, label: project.name, color: project.color };
    const client = catalog.clients.find((row) => same(row.name, value) || same(compact(row.name), value));
    if (client)
        return { kind: 'client', id: client.id, token: value, label: client.name };
    return null;
}
export function notesFromParts(parts) {
    return parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
}
export function chipsFromParts(parts) {
    return parts.filter((part) => part.type === 'chip').map((part) => part.chip);
}
export function assignmentFromChips(chips, catalog) {
    let next = emptyAssignment();
    for (const chip of chips) {
        if (chip.kind === 'project')
            next = applyProject(next, chip.id, catalog);
        else if (chip.kind === 'activity')
            next = applyActivity(next, chip.id, catalog);
        else if (!next.clientIds.includes(chip.id))
            next = { ...next, clientIds: [...next.clientIds, chip.id] };
    }
    if (!next.projectId)
        return next;
    const required = splitClientIds(catalog, next.projectId);
    if (required.length === 0)
        return next;
    const present = new Set(chips.filter((chip) => chip.kind === 'client').map((chip) => chip.id));
    if (required.every((id) => present.has(id)))
        return next;
    return {
        ...next,
        projectId: '',
        activityId: '',
        clientIds: chips.filter((chip) => chip.kind === 'client').map((chip) => chip.id),
    };
}
export function chipsImpliedByHit(hit, catalog, existing) {
    const has = (kind, id) => existing.some((chip) => chip.kind === kind && chip.id === id);
    const withSplitClients = (projectId, chips) => {
        for (const id of splitClientIds(catalog, projectId)) {
            if (!has('client', id) && !chips.some((chip) => chip.kind === 'client' && chip.id === id)) {
                chips.push({ kind: 'client', id });
            }
        }
        return chips;
    };
    if (hit.kind === 'activity') {
        const activity = catalog.activities.find((row) => row.id === hit.id);
        const chips = [];
        if (activity && !has('project', activity.project_id))
            chips.push({ kind: 'project', id: activity.project_id });
        if (!has('activity', hit.id))
            chips.push({ kind: 'activity', id: hit.id });
        if (activity?.client_id && !has('client', activity.client_id))
            chips.push({ kind: 'client', id: activity.client_id });
        return activity ? withSplitClients(activity.project_id, chips) : chips;
    }
    if (hit.kind === 'project') {
        const chips = [];
        if (!has('project', hit.id))
            chips.push({ kind: 'project', id: hit.id });
        return withSplitClients(hit.id, chips);
    }
    if (has(hit.kind, hit.id))
        return [];
    return [{ kind: hit.kind, id: hit.id }];
}
export function syncPartsToAssignment(parts, assignment, catalog) {
    const kept = parts.filter((part) => {
        if (part.type !== 'chip')
            return true;
        const chip = part.chip;
        if (chip.kind === 'project')
            return chip.id === assignment.projectId;
        if (chip.kind === 'activity')
            return chip.id === assignment.activityId;
        return assignment.clientIds.includes(chip.id);
    });
    const chips = chipsFromParts(kept);
    const missing = [];
    if (assignment.projectId && !chips.some((chip) => chip.kind === 'project' && chip.id === assignment.projectId)) {
        missing.push({ kind: 'project', id: assignment.projectId });
    }
    if (assignment.activityId && !chips.some((chip) => chip.kind === 'activity' && chip.id === assignment.activityId)) {
        missing.push({ kind: 'activity', id: assignment.activityId });
    }
    for (const id of assignment.clientIds) {
        if (!chips.some((chip) => chip.kind === 'client' && chip.id === id))
            missing.push({ kind: 'client', id });
    }
    if (missing.length === 0)
        return kept;
    return [...missing.map((chip) => ({ type: 'chip', chip })), ...kept];
}
export function mentionChoices(query, catalog, workspaceId, assignment = emptyAssignment()) {
    const q = query.toLowerCase();
    const items = [];
    const scoped = Boolean(assignment.projectId);
    if (!scoped) {
        const inWorkspace = (id) => !workspaceId || id === workspaceId;
        const projects = catalog.projects.filter((row) => inWorkspace(row.workspace_id));
        for (const alias of catalog.aliases.filter((row) => inWorkspace(row.workspace_id))) {
            const project = projects.find((row) => row.id === alias.project_id);
            if (!project)
                continue;
            if (q && !alias.shortcut.toLowerCase().includes(q) && !project.name.toLowerCase().includes(q))
                continue;
            items.push({ kind: 'project', id: project.id, token: alias.shortcut, label: `${alias.shortcut} · ${project.name}`, color: project.color });
        }
        for (const project of projects) {
            if (q && !project.name.toLowerCase().includes(q))
                continue;
            if (items.some((item) => item.kind === 'project' && item.id === project.id && item.token.toLowerCase() === project.name.toLowerCase())) {
                continue;
            }
            items.push({ kind: 'project', id: project.id, token: project.name.replace(/\s+/g, ''), label: project.name, color: project.color });
        }
        for (const activity of catalog.activities.filter((row) => inWorkspace(row.workspace_id))) {
            if (q && !activity.name.toLowerCase().includes(q))
                continue;
            const project = projects.find((row) => row.id === activity.project_id);
            items.push({
                kind: 'activity',
                id: activity.id,
                token: activity.name.replace(/\s+/g, ''),
                label: activity.name,
                color: project?.color,
            });
        }
        for (const client of catalog.clients.filter((row) => inWorkspace(row.workspace_id))) {
            if (q && !client.name.toLowerCase().includes(q))
                continue;
            items.push({ kind: 'client', id: client.id, token: client.name.replace(/\s+/g, ''), label: client.name });
        }
    }
    else {
        const project = catalog.projects.find((row) => row.id === assignment.projectId);
        for (const activity of catalog.activities.filter((row) => row.project_id === assignment.projectId)) {
            if (activity.id === assignment.activityId)
                continue;
            if (q && !activity.name.toLowerCase().includes(q))
                continue;
            items.push({
                kind: 'activity',
                id: activity.id,
                token: activity.name.replace(/\s+/g, ''),
                label: activity.name,
                color: project?.color,
            });
        }
        const allowed = new Set(catalog.projectClients.filter((row) => row.project_id === assignment.projectId).map((row) => row.client_id));
        for (const client of catalog.clients.filter((row) => allowed.has(row.id))) {
            if (assignment.clientIds.includes(client.id))
                continue;
            if (q && !client.name.toLowerCase().includes(q))
                continue;
            items.push({ kind: 'client', id: client.id, token: client.name.replace(/\s+/g, ''), label: client.name });
        }
    }
    return items;
}
