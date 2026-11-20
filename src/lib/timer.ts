import { mirrorSensitive } from '@/features/crypto/field-mirror'
import { supabase } from '@/lib/supabase'

export const ENTRY_SELECT =
  '*, project:projects(*), activity:activities(*), time_entry_clients(client_id), time_entry_tags(tag_id, tags(*)), time_entry_requests(request_id), time_entry_tasks(task_id)'

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids)]
}

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  const a = [...left].sort()
  const b = [...right].sort()
  return a.every((id, index) => id === b[index])
}

async function resolveActivityId(projectId: string | null, activityId: string | null | undefined) {
  if (activityId) return activityId
  if (!projectId) return null
  const { data, error } = await supabase
    .from('activities')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_default', true)
    .maybeSingle()
  fail(error)
  return (data?.id as string | undefined) ?? null
}

export async function startTimer(input: {
  workspaceId: string
  projectId: string | null
  description?: string
  billable?: boolean
  tagIds?: string[]
  source?: 'manual' | 'quick_start'
  activityId?: string | null
  clientIds?: string[]
  requestIds?: string[]
  taskIds?: string[]
}) {
  const { data, error } = await supabase.rpc('start_time_entry', {
    p_workspace_id: input.workspaceId,
    p_project_id: input.projectId,
    p_description: input.description ?? '',
    p_billable: input.billable ?? true,
    p_tag_ids: input.tagIds ?? [],
    p_source: input.source ?? 'quick_start',
  })
  fail(error)
  const entry = data as { id: string }
  const activityId = await resolveActivityId(input.projectId, input.activityId)
  await applyEntryExtras(entry.id, input.workspaceId, activityId, input.clientIds ?? [])
  if (input.requestIds) await replaceEntryRequests(entry.id, input.workspaceId, input.requestIds)
  if (input.taskIds) await replaceEntryTasks(entry.id, input.workspaceId, input.taskIds)
  await mirrorSensitive('time_entries', entry.id, { description: input.description ?? '' })
  return data
}

export async function stopTimer() {
  const { error } = await supabase.rpc('stop_running_timer')
  fail(error)
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser()
  fail(error)
  if (!data.user) throw new Error('Not signed in')
  return data.user.id
}

function durationSeconds(startedAt: Date, stoppedAt: Date) {
  return Math.max(0, Math.floor((stoppedAt.getTime() - startedAt.getTime()) / 1000))
}

async function applyEntryExtras(entryId: string, workspaceId: string, activityId: string | null, clientIds: string[]) {
  const { error } = await supabase.from('time_entries').update({ activity_id: activityId }).eq('id', entryId)
  fail(error)
  await replaceEntryClients(entryId, workspaceId, clientIds)
}

async function replaceEntryClients(entryId: string, workspaceId: string, clientIds: string[], previous?: string[]) {
  const unique = uniqueIds(clientIds)
  if (previous && sameIds(unique, uniqueIds(previous))) return
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
  })
}

async function replaceEntryRequests(entryId: string, workspaceId: string, requestIds: string[], previous?: string[]) {
  const unique = uniqueIds(requestIds)
  if (previous && sameIds(unique, uniqueIds(previous))) return
  const allowed = await allowedIds('requests', workspaceId, unique)
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
  })
}

async function replaceEntryTasks(entryId: string, workspaceId: string, taskIds: string[], previous?: string[]) {
  const unique = uniqueIds(taskIds)
  if (previous && sameIds(unique, uniqueIds(previous))) return
  const allowed = await allowedIds('tasks', workspaceId, unique)
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
  })
}

async function allowedIds(table: 'requests' | 'tasks', workspaceId: string, ids: string[]) {
  if (ids.length === 0) return []
  const { data, error } = await supabase.from(table).select('id').eq('workspace_id', workspaceId).in('id', ids)
  fail(error)
  return (data ?? []).map((row) => row.id as string)
}

async function syncLinks(input: {
  table: 'time_entry_clients' | 'time_entry_requests' | 'time_entry_tasks'
  entryId: string
  column: 'client_id' | 'request_id' | 'task_id'
  ids: string[]
  rows: Record<string, string>[]
}) {
  let remove = supabase.from(input.table).delete().eq('time_entry_id', input.entryId)
  if (input.ids.length > 0) remove = remove.not(input.column, 'in', `(${input.ids.join(',')})`)
  const { error: clearError } = await remove
  fail(clearError)
  if (input.rows.length === 0) return
  const { error } = await supabase.from(input.table).upsert(input.rows, {
    onConflict: `time_entry_id,${input.column}`,
    ignoreDuplicates: true,
  })
  fail(error)
}

export async function createEntry(input: {
  workspaceId: string
  projectId: string
  description: string
  billable: boolean
  tagIds: string[]
  startedAt: Date
  stoppedAt: Date
  activityId?: string | null
  clientIds?: string[]
  requestIds?: string[]
  taskIds?: string[]
}) {
  const userId = await currentUserId()
  const activityId = await resolveActivityId(input.projectId, input.activityId)
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
    .single()
  fail(error)
  if (!data) throw new Error('Could not save entry')
  if (input.tagIds.length > 0) {
    const { error: tagError } = await supabase.from('time_entry_tags').insert(
      input.tagIds.map((tagId) => ({
        time_entry_id: data.id,
        tag_id: tagId,
        workspace_id: input.workspaceId,
      })),
    )
    fail(tagError)
  }
  await replaceEntryClients(data.id, input.workspaceId, input.clientIds ?? [])
  if (input.requestIds) await replaceEntryRequests(data.id, input.workspaceId, input.requestIds)
  if (input.taskIds) await replaceEntryTasks(data.id, input.workspaceId, input.taskIds)
  await mirrorSensitive('time_entries', data.id, { description: input.description })
  return data
}

export async function updateEntry(input: {
  id: string
  workspaceId: string
  projectId: string
  description: string
  billable: boolean
  tagIds: string[]
  startedAt: Date
  stoppedAt: Date
  activityId?: string | null
  clientIds?: string[]
  requestIds?: string[]
  taskIds?: string[]
}) {
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
    .eq('id', input.id)
  fail(error)
  const { error: clearError } = await supabase.from('time_entry_tags').delete().eq('time_entry_id', input.id)
  fail(clearError)
  if (input.tagIds.length > 0) {
    const { error: tagError } = await supabase.from('time_entry_tags').insert(
      input.tagIds.map((tagId) => ({
        time_entry_id: input.id,
        tag_id: tagId,
        workspace_id: input.workspaceId,
      })),
    )
    fail(tagError)
  }
  await replaceEntryClients(input.id, input.workspaceId, input.clientIds ?? [])
  if (input.requestIds) await replaceEntryRequests(input.id, input.workspaceId, input.requestIds)
  if (input.taskIds) await replaceEntryTasks(input.id, input.workspaceId, input.taskIds)
  await mirrorSensitive('time_entries', input.id, { description: input.description })
}

export async function updateRunningEntry(input: {
  id: string
  workspaceId: string
  projectId: string | null
  description: string
  billable: boolean
  activityId: string | null
  clientIds: string[]
  requestIds?: string[]
  taskIds?: string[]
}) {
  const { error } = await supabase
    .from('time_entries')
    .update({
      workspace_id: input.workspaceId,
      project_id: input.projectId,
      activity_id: input.activityId,
      description: input.description,
      billable: input.billable,
    })
    .eq('id', input.id)
  fail(error)
  await replaceEntryClients(input.id, input.workspaceId, input.clientIds)
  if (input.requestIds) await replaceEntryRequests(input.id, input.workspaceId, input.requestIds)
  if (input.taskIds) await replaceEntryTasks(input.id, input.workspaceId, input.taskIds)
  await mirrorSensitive('time_entries', input.id, { description: input.description })
}

export type EntryPatch = {
  id: string
  workspaceId: string
  projectId: string
  description: string
  billable: boolean
  activityId: string | null
  clientIds: string[]
  requestIds: string[]
  taskIds: string[]
  startedAt: Date
  stoppedAt: Date
}

export async function patchEntry(input: EntryPatch, previous: EntryPatch) {
  const columns: {
    workspace_id?: string
    project_id?: string
    activity_id?: string | null
    description?: string
    billable?: boolean
    started_at?: string
    stopped_at?: string
    duration_seconds?: number
  } = {}
  if (input.workspaceId !== previous.workspaceId) columns.workspace_id = input.workspaceId
  if (input.projectId !== previous.projectId) columns.project_id = input.projectId
  if (input.activityId !== previous.activityId) columns.activity_id = input.activityId
  if (input.description !== previous.description) columns.description = input.description
  if (input.billable !== previous.billable) columns.billable = input.billable
  if (
    input.startedAt.getTime() !== previous.startedAt.getTime() ||
    input.stoppedAt.getTime() !== previous.stoppedAt.getTime()
  ) {
    columns.started_at = input.startedAt.toISOString()
    columns.stopped_at = input.stoppedAt.toISOString()
    columns.duration_seconds = durationSeconds(input.startedAt, input.stoppedAt)
  }
  if (Object.keys(columns).length > 0) {
    const { error } = await supabase.from('time_entries').update(columns).eq('id', input.id)
    fail(error)
  }
  await replaceEntryClients(input.id, input.workspaceId, input.clientIds, previous.clientIds)
  await replaceEntryRequests(input.id, input.workspaceId, input.requestIds, previous.requestIds)
  await replaceEntryTasks(input.id, input.workspaceId, input.taskIds, previous.taskIds)
  if (columns.description !== undefined) {
    await mirrorSensitive('time_entries', input.id, { description: input.description })
  }
}

export async function updateEntryDescription(id: string, description: string) {
  const { error } = await supabase.from('time_entries').update({ description }).eq('id', id)
  fail(error)
  await mirrorSensitive('time_entries', id, { description })
}

export async function stopEntry(id: string, startedAt: string) {
  const stoppedAt = new Date()
  const { error } = await supabase
    .from('time_entries')
    .update({
      stopped_at: stoppedAt.toISOString(),
      duration_seconds: durationSeconds(new Date(startedAt), stoppedAt),
    })
    .eq('id', id)
  fail(error)
}

export async function updateEntrySpan(id: string, startedAt: Date, stoppedAt: Date) {
  const { error } = await supabase
    .from('time_entries')
    .update({
      started_at: startedAt.toISOString(),
      stopped_at: stoppedAt.toISOString(),
      duration_seconds: durationSeconds(startedAt, stoppedAt),
    })
    .eq('id', id)
  fail(error)
}

export async function deleteEntry(id: string) {
  const { error } = await supabase.from('time_entries').delete().eq('id', id)
  fail(error)
}
