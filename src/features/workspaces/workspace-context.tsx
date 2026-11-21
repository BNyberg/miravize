import { useAuth } from '@/features/auth/auth-context'
import { revealList } from '@/features/crypto/read-copy'
import { qk } from '@/lib/query-keys'
import { supabase } from '@/lib/supabase'
import type { Membership, Workspace } from '@/types'
import { ALL_WORKSPACES, resolveWorkspaceSelection } from '@/features/workspaces/resolve-workspace'
import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

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
  const { user } = useAuth()
  const [workspaceId, setWorkspaceIdState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return stored
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy) {
      localStorage.setItem(STORAGE_KEY, legacy)
      return legacy
    }
    return ALL_WORKSPACES
  })

  const { data = [], isLoading } = useQuery({
    queryKey: [...qk.memberships, user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_members')
        .select('id, workspace_id, user_id, role, workspace:workspaces(*)')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      const rows = (data ?? []) as unknown as Membership[]
      const mine = new Map<string, Membership>()
      for (const row of rows) {
        if (row.user_id !== user!.id || mine.has(row.workspace_id)) continue
        mine.set(row.workspace_id, row)
      }
      return revealList(null, [...mine.values()])
    },
  })

  function setWorkspaceId(id: string) {
    setWorkspaceIdState(id)
    localStorage.setItem(STORAGE_KEY, id)
  }

  const value = useMemo(() => {
    const selection = resolveWorkspaceSelection(workspaceId, data)
    return {
      workspaceId: selection.validId,
      setWorkspaceId,
      isAll: selection.isAll,
      memberships: data,
      current: selection.current,
      workspaces: data.map((m) => m.workspace),
      canManage: manages(selection.current?.role),
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

export { ALL_WORKSPACES }
