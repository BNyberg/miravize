import { jsx as _jsx } from "react/jsx-runtime";
import { qk } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, useState } from 'react';
const ALL = 'all';
const STORAGE_KEY = 'miravize-workspace-id';
const LEGACY_STORAGE_KEY = 'genki-workspace-id';
function manages(role) {
    return role === 'owner' || role === 'admin';
}
const WorkspaceContext = createContext(null);
export function WorkspaceProvider({ children }) {
    const [workspaceId, setWorkspaceIdState] = useState(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored)
            return stored;
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
            localStorage.setItem(STORAGE_KEY, legacy);
            return legacy;
        }
        return ALL;
    });
    const { data = [], isLoading } = useQuery({
        queryKey: qk.memberships,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('workspace_members')
                .select('id, workspace_id, user_id, role, workspace:workspaces(*)')
                .order('created_at', { ascending: true });
            if (error)
                throw error;
            return (data ?? []);
        },
    });
    function setWorkspaceId(id) {
        setWorkspaceIdState(id);
        localStorage.setItem(STORAGE_KEY, id);
    }
    const value = useMemo(() => {
        const current = data.find((m) => m.workspace_id === workspaceId) ?? null;
        const validId = workspaceId === ALL || current ? workspaceId : (data[0]?.workspace_id ?? ALL);
        return {
            workspaceId: validId,
            setWorkspaceId,
            isAll: validId === ALL,
            memberships: data,
            current,
            workspaces: data.map((m) => m.workspace),
            canManage: manages(current?.role),
            canManageWorkspace: (id) => manages(data.find((membership) => membership.workspace_id === id)?.role),
            loading: isLoading,
        };
    }, [data, isLoading, workspaceId]);
    return _jsx(WorkspaceContext.Provider, { value: value, children: children });
}
export function useWorkspace() {
    const ctx = useContext(WorkspaceContext);
    if (!ctx)
        throw new Error('useWorkspace must be used within WorkspaceProvider');
    return ctx;
}
export { ALL as ALL_WORKSPACES };
