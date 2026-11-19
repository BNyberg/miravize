import { supabase } from '@/lib/supabase';
import { suggestWorkspaceIdCode } from '@/lib/workspace-id-code';
const inflight = new Map();
/** Creates the workspace from signup metadata when the account has none yet. */
export function ensureSignupWorkspace(userId, name, idCode) {
    const trimmed = name.trim();
    if (!trimmed)
        return Promise.resolve();
    const code = idCode?.trim() || suggestWorkspaceIdCode(trimmed);
    if (!code)
        return Promise.resolve();
    const existing = inflight.get(userId);
    if (existing)
        return existing;
    const job = (async () => {
        const { count, error } = await supabase
            .from('workspace_members')
            .select('id', { count: 'exact', head: true });
        if (error || (count ?? 0) > 0)
            return;
        const { error: createError } = await supabase.rpc('create_workspace', { p_name: trimmed, p_id_code: code });
        if (createError)
            throw createError;
    })().finally(() => {
        inflight.delete(userId);
    });
    inflight.set(userId, job);
    return job;
}
