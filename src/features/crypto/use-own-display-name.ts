import { useQuery } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

import { useAuth } from '@/features/auth/auth-context'
import { listHeldWorkspaceKeys, subscribeReadMode } from '@/features/crypto/field-mirror'
import { loadOwnDisplayName } from '@/features/crypto/publish-display-name'

function heldKeySnapshot() {
  return listHeldWorkspaceKeys()
    .map((held) => `${held.workspaceId}:${held.keyVersion}`)
    .join('|')
}

export function useOwnDisplayName() {
  const { user } = useAuth()
  const held = useSyncExternalStore(subscribeReadMode, heldKeySnapshot)
  const query = useQuery({
    queryKey: ['own-display-name', user?.id, held],
    enabled: Boolean(user?.id),
    queryFn: () => loadOwnDisplayName(user?.id ?? ''),
  })
  return query.data ?? ''
}
