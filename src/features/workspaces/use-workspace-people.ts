import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'

import { revealMemberName } from '@/features/crypto/publish-display-name'
import { qk } from '@/lib/query-keys'
import { supabase } from '@/lib/supabase'
import type { WorkspaceRole } from '@/types'

export type WorkspacePerson = {
  id: string
  user_id: string
  email: string
  role: WorkspaceRole
  full_name: string | null
  avatar_url: string | null
}

export function useWorkspacePeople(workspaceIds: string[]) {
  const key = [...new Set(workspaceIds)].filter(Boolean).sort().join('|')
  const ids = useMemo(() => (key ? key.split('|') : []), [key])
  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: qk.members(id),
      queryFn: async () => {
        const { data, error } = await supabase.rpc('workspace_people', { p_workspace_id: id })
        if (error) throw error
        const rows = (data ?? []) as (WorkspacePerson & { display_name_ciphertext?: unknown })[]
        return Promise.all(rows.map((row) => revealMemberName(id, row)))
      },
    })),
  })

  const ready = queries.every((query) => query.isSuccess || query.isError)
  const byWorkspace = new Map<string, WorkspacePerson[]>()
  ids.forEach((id, index) => {
    byWorkspace.set(id, queries[index]?.data ?? [])
  })

  return { byWorkspace, ready }
}
