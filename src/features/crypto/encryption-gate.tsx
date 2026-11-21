import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'

import { toast } from 'sonner'
import { useAuth } from '@/features/auth/auth-context'
import { loadCryptoProfile } from '@/lib/crypto/account-profile'
import { supabase } from '@/lib/supabase'

type CryptoGate = 'loading' | 'ready' | 'missing' | 'error'

export function EncryptionGate({ children }: { children: ReactNode }) {
  const { user, gate } = useAuth()
  const location = useLocation()
  const [status, setStatus] = useState<CryptoGate>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (gate !== 'ready' || !user) return
    let cancelled = false
    void loadCryptoProfile()
      .then((profile) => {
        if (cancelled) return
        setStatus(profile?.crypto_status === 'ready' ? 'ready' : 'missing')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        toast.error("Couldn't check encryption setup", { description: error instanceof Error ? error.message : 'Could not check encryption setup.' })
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [attempt, gate, user])

  if (status === 'loading') return <div className="min-h-svh bg-background" />

  if (status === 'missing') {
    const next = encodeURIComponent(`${location.pathname}${location.search}`)
    return <Navigate to={`/encryption-setup?next=${next}`} replace />
  }

  if (status === 'error') {
    return (
      <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-3 p-8">
        <button type="button" className="text-sm font-medium underline-offset-4 hover:underline" onClick={() => {
          setStatus('loading')
          setAttempt((value) => value + 1)
        }}>
          Try again
        </button>
        <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    )
  }

  return children
}
