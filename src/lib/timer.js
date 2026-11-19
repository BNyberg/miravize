import { supabase } from '@/lib/supabase';
export const ENTRY_SELECT = '*, project:projects(*), activity:activities(*), time_entry_clients(client_id), time_entry_tags(tag_id, tags(*)), time_entry_requests(request_id), time_entry_tasks(task_id)';
function fail(error) {
    if (error)
        throw new Error(error.message);
}
function uniqueIds(ids) {
    return [...new Set(ids)];
}
function sameIds(left, right) {
    if (left.length !== right.length)
        return false;
    const a = [...left].sort();
    const b = [...right].sort();
    return a.every((id, index) => id === b[index]);
}
async function resolveActivityId(projectId, activityId) {
    if (activityId)
        return activityId;
    if (!projectId)
        return null;
    const { data, error } = await supabase
        .from('activities')
        .select('id')
        .eq('project_id', projectId)
        .eq('is_default', true)
        .maybeSingle();
    fail(error);
    return data?.id ?? null;
}
export async function startTimer(input) {
    const { data, error } = await supabase.rpc('start_time_entry', {
        p_workspace_id: input.workspaceId,
        p_project_id: input.projectId,
        p_description: input.description ?? '',
        p_billable: input.billable ?? true,
        p_tag_ids: input.tagIds ?? [],
        p_source: input.source ?? 'quick_start',
    });
    fail(error);
    const entry = data;
    const activityId = await resolveActivityId(input.projectId, input.activityId);
    await applyEntryExtras(entry.id, input.workspaceId, activityId, input.clientIds ?? []);
    if (input.requestIds)
        await replaceEntryRequests(entry.id, input.workspaceId, input.requestIds);
    if (input.taskIds)
        await replaceEntryTasks(entry.id, input.workspaceId, input.taskIds);
    return data;
}
export async function stopTimer() {
    const { error } = await supabase.rpc('stop_running_timer');
    fail(error);
}
async function currentUserId() {
    const { data, error } = await supabase.auth.getUser();
    fail(error);
    if (!data.user)
        throw new Error('Not signed in');
    return data.user.id;
}
function durationSeconds(startedAt, stoppedAt) {
    return Math.max(0, Math.floor((stoppedAt.getTime() - startedAt.getTime()) / 1000));
}
async function applyEntryExtras(entryId, workspaceId, activityId, clientIds) {
    const { error } = await supabase.from('time_entries').update({ activity_id: activityId }).eq('id', entryId);
    fail(error);
    await replaceEntryClients(entryId, workspaceId, clientIds);
}
async function replaceEntryClients(entryId, workspaceId, clientIds, previous) {
    const unique = uniqueIds(clientIds);
    if (previous && sameIds(unique, uniqueIds(previous)))
        return;
    await syncLinks({
        table: 'time_entry_clients',
        entryId,
        column: 'client_id',
        ids: unique,
        rows: unique.map((clientId) => ({
            time_entry_id: entryId,
            client_id: clientId,
            workspace_id: workspaceId,
        })),
    });
}
async function replaceEntryRequests(entryId, workspaceId, requestIds, previous) {
    const unique = uniqueIds(requestIds);
    if (previous && sameIds(unique, uniqueIds(previous)))
        return;
    const allowed = await allowedIds('requests', workspaceId, unique);
    await syncLinks({
        table: 'time_entry_requests',
        entryId,
        column: 'request_id',
        ids: allowed,
        rows: allowed.map((requestId) => ({
            time_entry_id: entryId,
            request_id: requestId,
            workspace_id: workspaceId,
        })),
    });
}
async function replaceEntryTasks(entryId, workspaceId, taskIds, previous) {
    const unique = uniqueIds(taskIds);
    if (previous && sameIds(unique, uniqueIds(previous)))
        return;
    const allowed = await allowedIds('tasks', workspaceId, unique);
    await syncLinks({
        table: 'time_entry_tasks',
        entryId,
        column: 'task_id',
        ids: allowed,
        rows: allowed.map((taskId) => ({
            time_entry_id: entryId,
            task_id: taskId,
            workspace_id: workspaceId,
        })),
    });
}
async function allowedIds(table, workspaceId, ids) {
    if (ids.length === 0)
        return [];
    const { data, error } = await supabase.from(table).select('id').eq('workspace_id', workspaceId).in('id', ids);
    fail(error);
    return (data ?? []).map((row) => row.id);
}
async function syncLinks(input) {
    let remove = supabase.from(input.table).delete().eq('time_entry_id', input.entryId);
    if (input.ids.length > 0)
        remove = remove.not(input.column, 'in', `(${input.ids.join(',')})`);
    const { error: clearError } = await remove;
    fail(clearError);
    if (input.rows.length === 0)
        return;
    const { error } = await supabase.from(input.table).upsert(input.rows, {
        onConflict: `time_entry_id,${input.column}`,
        ignoreDuplicates: true,
    });
    fail(error);
}
export async function createEntry(input) {
    const userId = await currentUserId();
    const activityId = await resolveActivityId(input.projectId, input.activityId);
    const { data, error } = await supabase
        .from('time_entries')
        .insert({
        workspace_id: input.workspaceId,
        user_id: userId,
        project_id: input.projectId,
        activity_id: activityId,
        description: input.description,
        billable: input.billable,
        source: 'manual',
        started_at: input.startedAt.toISOString(),
        stopped_at: input.stoppedAt.toISOString(),
        duration_seconds: durationSeconds(input.startedAt, input.stoppedAt),
    })
        .select('id')
        .single();
    fail(error);
    if (!data)
        throw new Error('Could not save entry');
    if (input.tagIds.length > 0) {
        const { error: tagError } = await supabase.from('time_entry_tags').insert(input.tagIds.map((tagId) => ({
            time_entry_id: data.id,
            tag_id: tagId,
            workspace_id: input.workspaceId,
        })));
        fail(tagError);
    }
    await replaceEntryClients(data.id, input.workspaceId, input.clientIds ?? []);
    if (input.requestIds)
        await replaceEntryRequests(data.id, input.workspaceId, input.requestIds);
    if (input.taskIds)
        await replaceEntryTasks(data.id, input.workspaceId, input.taskIds);
    return data;
}
export async function updateEntry(input) {
    const { error } = await supabase
        .from('time_entries')
        .update({
        workspace_id: input.workspaceId,
        project_id: input.projectId,
        activity_id: input.activityId ?? null,
        description: input.description,
        billable: input.billable,
        started_at: input.startedAt.toISOString(),
        stopped_at: input.stoppedAt.toISOString(),
        duration_seconds: durationSeconds(input.startedAt, input.stoppedAt),
    })
        .eq('id', input.id);
    fail(error);
    const { error: clearError } = await supabase.from('time_entry_tags').delete().eq('time_entry_id', input.id);
    fail(clearError);
    if (input.tagIds.length > 0) {
        const { error: tagError } = await supabase.from('time_entry_tags').insert(input.tagIds.map((tagId) => ({
            time_entry_id: input.id,
            tag_id: tagId,
            workspace_id: input.workspaceId,
        })));
        fail(tagError);
    }
    await replaceEntryClients(input.id, input.workspaceId, input.clientIds ?? []);
    if (input.requestIds)
        await replaceEntryRequests(input.id, input.workspaceId, input.requestIds);
    if (input.taskIds)
        await replaceEntryTasks(input.id, input.workspaceId, input.taskIds);
}
export async function updateRunningEntry(input) {
    const { error } = await supabase
        .from('time_entries')
        .update({
        workspace_id: input.workspaceId,
        project_id: input.projectId,
        activity_id: input.activityId,
        description: input.description,
        billable: input.billable,
    })
        .eq('id', input.id);
    fail(error);
    await replaceEntryClients(input.id, input.workspaceId, input.clientIds);
    if (input.requestIds)
        await replaceEntryRequests(input.id, input.workspaceId, input.requestIds);
    if (input.taskIds)
        await replaceEntryTasks(input.id, input.workspaceId, input.taskIds);
}
export async function patchEntry(input, previous) {
    const columns = {};
    if (input.workspaceId !== previous.workspaceId)
        columns.workspace_id = input.workspaceId;
    if (input.projectId !== previous.projectId)
        columns.project_id = input.projectId;
    if (input.activityId !== previous.activityId)
        columns.activity_id = input.activityId;
    if (input.description !== previous.description)
        columns.description = input.description;
    if (input.billable !== previous.billable)
        columns.billable = input.billable;
    if (input.startedAt.getTime() !== previous.startedAt.getTime() ||
        input.stoppedAt.getTime() !== previous.stoppedAt.getTime()) {
        columns.started_at = input.startedAt.toISOString();
        columns.stopped_at = input.stoppedAt.toISOString();
        columns.duration_seconds = durationSeconds(input.startedAt, input.stoppedAt);
    }
    if (Object.keys(columns).length > 0) {
        const { error } = await supabase.from('time_entries').update(columns).eq('id', input.id);
        fail(error);
    }
    await replaceEntryClients(input.id, input.workspaceId, input.clientIds, previous.clientIds);
    await replaceEntryRequests(input.id, input.workspaceId, input.requestIds, previous.requestIds);
    await replaceEntryTasks(input.id, input.workspaceId, input.taskIds, previous.taskIds);
}
export async function updateEntryDescription(id, description) {
    const { error } = await supabase.from('time_entries').update({ description }).eq('id', id);
    fail(error);
}
export async function updateEntrySpan(id, startedAt, stoppedAt) {
    const { error } = await supabase
        .from('time_entries')
        .update({
        started_at: startedAt.toISOString(),
        stopped_at: stoppedAt.toISOString(),
        duration_seconds: durationSeconds(startedAt, stoppedAt),
    })
        .eq('id', id);
    fail(error);
}
export async function deleteEntry(id) {
    const { error } = await supabase.from('time_entries').delete().eq('id', id);
    fail(error);
}
