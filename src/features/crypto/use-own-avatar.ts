import { useQuery } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

import { useAuth } from '@/features/auth/auth-context'
import { avatarObjectUrl, loadOwnAvatar } from '@/features/crypto/publish-avatar'
import { listHeldWorkspaceKeys, subscribeReadMode } from '@/features/crypto/field-mirror'

function heldKeySnapshot() {
  return listHeldWorkspaceKeys()
    .map((held) => `${held.workspaceId}:${held.keyVersion}`)
    .join('|')
}

export function useOwnAvatar() {
  const { user } = useAuth()
  const held = useSyncExternalStore(subscribeReadMode, heldKeySnapshot)
  const query = useQuery({
    queryKey: ['own-avatar', user?.id, held],
    enabled: Boolean(user?.id),
    queryFn: () => loadOwnAvatar(user?.id ?? ''),
  })
  return query.data ? avatarObjectUrl(query.data) : undefined
}
