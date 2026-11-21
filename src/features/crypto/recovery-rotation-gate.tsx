import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router'

import { toast } from 'sonner'
import { loadCryptoProfile } from '@/lib/crypto/account-profile'
import { supabase } from '@/lib/supabase'

type RotationGate = 'loading' | 'open' | 'pending' | 'error'

export function RecoveryRotationGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<RotationGate>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void loadCryptoProfile()
      .then((profile) => {
        if (cancelled) return
        setStatus(profile?.recovery_rotation_pending === true ? 'pending' : 'open')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        toast.error("Couldn't check the recovery key", { description: error instanceof Error ? error.message : 'Try again.' })
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (status === 'loading') return <div className="min-h-svh bg-background" />

  if (status === 'error') {
    return (
      <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-3 p-8">
        <button
          type="button"
          className="text-sm font-medium underline-offset-4 hover:underline"
          onClick={() => {
            setStatus('loading')
            setAttempt((value) => value + 1)
          }}
        >
          Try again
        </button>
        <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    )
  }

  if (status === 'pending') return <Navigate to="/reset-password" replace />
  return children
}
