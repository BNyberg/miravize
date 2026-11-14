import { qk } from '@/lib/query-keys'
import { supabase } from '@/lib/supabase'
import type { Membership, Workspace } from '@/types'
import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

const ALL = 'all'
const STORAGE_KEY = 'miravize-workspace-id'
const LEGACY_STORAGE_KEY = 'genki-workspace-id'

function manages(role: Membership['role'] | undefined) {
  return role === 'owner' || role === 'admin'
}

type WorkspaceContextValue = {
  workspaceId: string
  setWorkspaceId: (id: string) => void
  isAll: boolean
  memberships: Membership[]
  current: Membership | null
  workspaces: Workspace[]
  canManage: boolean
  canManageWorkspace: (id: string) => boolean
  loading: boolean
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaceId, setWorkspaceIdState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return stored
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy) {
      localStorage.setItem(STORAGE_KEY, legacy)
      return legacy
    }
    return ALL
  })

  const { data = [], isLoading } = useQuery({
    queryKey: qk.memberships,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_members')
        .select('id, workspace_id, user_id, role, workspace:workspaces(*)')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as Membership[]
    },
  })

  function setWorkspaceId(id: string) {
    setWorkspaceIdState(id)
    localStorage.setItem(STORAGE_KEY, id)
  }

  const value = useMemo(() => {
    const current = data.find((m) => m.workspace_id === workspaceId) ?? null
    const validId =
      workspaceId === ALL || current ? workspaceId : (data[0]?.workspace_id ?? ALL)
    return {
      workspaceId: validId,
      setWorkspaceId,
      isAll: validId === ALL,
      memberships: data,
      current,
      workspaces: data.map((m) => m.workspace),
      canManage: manages(current?.role),
      canManageWorkspace: (id: string) => manages(data.find((membership) => membership.workspace_id === id)?.role),
      loading: isLoading,
    }
  }, [data, isLoading, workspaceId])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}

export { ALL as ALL_WORKSPACES }
