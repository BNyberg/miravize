import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'

import { toast } from '@/components/ui/toast'
import { useAuth } from '@/features/auth/auth-context'
import { bindSessionKeys } from '@/features/crypto/field-mirror'
import { clearLoginPassword, hasLoginPassword, peekLoginPassword } from '@/features/crypto/login-secret'
import { forgetDualWorkspaces } from '@/features/crypto/read-copy'
import { unlockWorkspacesWithPassword } from '@/features/crypto/personal-backfill'

export function SessionUnlock({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const userId = user?.id ?? ''
  if (userId) bindSessionKeys(userId)
  const [opening, setOpening] = useState(hasLoginPassword)

  useEffect(() => {
    const pending = peekLoginPassword()
    if (!pending || !userId) {
      setOpening(false)
      return
    }
    let cancelled = false
    setOpening(true)
    void unlockWorkspacesWithPassword(pending.email, pending.password)
      .then(async () => {
        if (cancelled) return
        clearLoginPassword()
        forgetDualWorkspaces()
        await queryClient.invalidateQueries()
      })
      .catch((error: unknown) => {
        if (cancelled) return
        clearLoginPassword()
        toast({
          tone: 'error',
          title: "Couldn't open your workspaces",
          description: error instanceof Error ? error.message : 'Try again.',
        })
      })
      .finally(() => {
        if (!cancelled) setOpening(false)
      })
    return () => {
      cancelled = true
    }
  }, [queryClient, userId])

  if (opening) return <div className="min-h-svh bg-background" />
  return children
}
