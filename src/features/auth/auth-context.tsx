import { ensureSignupWorkspace } from '@/lib/ensure-signup-workspace'
import { qk } from '@/lib/query-keys'
import { supabase } from '@/lib/supabase'
import type { Session, User } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

type AuthContextValue = {
  user: User | null
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const user = session?.user
    const name = user?.user_metadata?.workspace_name
    if (!user || typeof name !== 'string' || !name.trim()) return
    let cancelled = false
    void ensureSignupWorkspace(user.id, name)
      .then(() => {
        if (!cancelled) void queryClient.invalidateQueries({ queryKey: qk.memberships })
      })
      .catch(() => {
        // Signup still succeeds; Settings can create a workspace if this fails.
      })
    return () => {
      cancelled = true
    }
  }, [queryClient, session?.user])

  const value = useMemo(
    () => ({ user: session?.user ?? null, session, loading }),
    [session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
