import { supabase } from '@/lib/supabase'

const inflight = new Map<string, Promise<void>>()

/** Creates the workspace from signup metadata when the account has none yet. */
export function ensureSignupWorkspace(userId: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) return Promise.resolve()

  const existing = inflight.get(userId)
  if (existing) return existing

  const job = (async () => {
    const { count, error } = await supabase
      .from('workspace_members')
      .select('id', { count: 'exact', head: true })
    if (error || (count ?? 0) > 0) return

    const { error: createError } = await supabase.rpc('create_workspace', { p_name: trimmed })
    if (createError) throw createError
  })().finally(() => {
    inflight.delete(userId)
  })

  inflight.set(userId, job)
  return job
}
