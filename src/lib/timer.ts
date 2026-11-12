import { supabase } from '@/lib/supabase'

export async function startTimer(input: {
  workspaceId: string
  projectId: string
  description?: string
  billable?: boolean
  tagIds?: string[]
  source?: 'manual' | 'quick_start'
}) {
  const { data, error } = await supabase.rpc('start_time_entry', {
    p_workspace_id: input.workspaceId,
    p_project_id: input.projectId,
    p_description: input.description ?? '',
    p_billable: input.billable ?? true,
    p_tag_ids: input.tagIds ?? [],
    p_source: input.source ?? 'quick_start',
  })
  if (error) throw error
  return data
}

export async function stopTimer() {
  const { error } = await supabase.rpc('stop_running_timer')
  if (error) throw error
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('Not signed in')
  return data.user.id
}

function durationSeconds(startedAt: Date, stoppedAt: Date) {
  return Math.max(0, Math.floor((stoppedAt.getTime() - startedAt.getTime()) / 1000))
}

export async function createEntry(input: {
  workspaceId: string
  projectId: string
  description: string
  billable: boolean
  tagIds: string[]
  startedAt: Date
  stoppedAt: Date
}) {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      workspace_id: input.workspaceId,
      user_id: userId,
      project_id: input.projectId,
      description: input.description,
      billable: input.billable,
      source: 'manual',
      started_at: input.startedAt.toISOString(),
      stopped_at: input.stoppedAt.toISOString(),
      duration_seconds: durationSeconds(input.startedAt, input.stoppedAt),
    })
    .select('id')
    .single()
  if (error) throw error
  if (input.tagIds.length > 0) {
    const { error: tagError } = await supabase.from('time_entry_tags').insert(
      input.tagIds.map((tagId) => ({
        time_entry_id: data.id,
        tag_id: tagId,
        workspace_id: input.workspaceId,
      })),
    )
    if (tagError) throw tagError
  }
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
}) {
  const { error } = await supabase
    .from('time_entries')
    .update({
      project_id: input.projectId,
      description: input.description,
      billable: input.billable,
      started_at: input.startedAt.toISOString(),
      stopped_at: input.stoppedAt.toISOString(),
      duration_seconds: durationSeconds(input.startedAt, input.stoppedAt),
    })
    .eq('id', input.id)
  if (error) throw error
  const { error: clearError } = await supabase.from('time_entry_tags').delete().eq('time_entry_id', input.id)
  if (clearError) throw clearError
  if (input.tagIds.length > 0) {
    const { error: tagError } = await supabase.from('time_entry_tags').insert(
      input.tagIds.map((tagId) => ({
        time_entry_id: input.id,
        tag_id: tagId,
        workspace_id: input.workspaceId,
      })),
    )
    if (tagError) throw tagError
  }
}

export async function updateEntryDescription(id: string, description: string) {
  const { error } = await supabase.from('time_entries').update({ description }).eq('id', id)
  if (error) throw error
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
  if (error) throw error
}

export async function deleteEntry(id: string) {
  const { error } = await supabase.from('time_entries').delete().eq('id', id)
  if (error) throw error
}
