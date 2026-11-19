import { ensureSignupWorkspace } from '@/lib/ensure-signup-workspace'
import { qk } from '@/lib/query-keys'
import { supabase } from '@/lib/supabase'
import type { Session, User } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { metadataFlag } from './mfa'

export type AuthGate = 'anon' | 'challenge' | 'setup' | 'backup' | 'ready' | 'error'
export type MfaHold = 'setup' | 'backup' | null

type Assurance = {
  currentLevel: string | null
  nextLevel: string | null
}

type AuthContextValue = {
  user: User | null
  session: Session | null
  loading: boolean
  gate: AuthGate
  assurance: Assurance
  assuranceError: string | null
  setHold: (hold: MfaHold) => void
  refreshAssurance: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function computeGate(session: Session, assurance: Assurance, hold: MfaHold): AuthGate {
  const metadata = session.user.user_metadata
  const current = assurance.currentLevel
  const next = assurance.nextLevel
  if (current === 'aal1' && next === 'aal2' && hold !== 'backup') return 'challenge'
  if (hold === 'backup' || metadataFlag(metadata, 'mfa_backup_pending')) return 'backup'
  if (metadataFlag(metadata, 'mfa_reenroll_required') || hold === 'setup') return 'setup'
  return 'ready'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [gate, setGate] = useState<AuthGate>('anon')
  const [assurance, setAssurance] = useState<Assurance>({ currentLevel: null, nextLevel: null })
  const [assuranceError, setAssuranceError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const sessionRef = useRef<Session | null>(null)
  const assuranceRef = useRef(assurance)
  const holdRef = useRef<MfaHold>(null)
  const refreshOnce = useRef(false)
  const resolvingRef = useRef(false)

  const apply = useCallback((nextSession: Session | null, nextAssurance: Assurance, error: string | null) => {
    sessionRef.current = nextSession
    assuranceRef.current = nextAssurance
    setSession(nextSession)
    setAssurance(nextAssurance)
    setAssuranceError(error)
    if (!nextSession) {
      setGate('anon')
      return
    }
    if (error) {
      setAssuranceError(error)
      setGate((current) => (current === 'ready' || current === 'challenge' || current === 'setup' || current === 'backup' ? current : 'error'))
      return
    }
    setGate(computeGate(nextSession, nextAssurance, holdRef.current))
  }, [])

  const resolve = useCallback(
    async (nextSession: Session, allowRefresh = true) => {
      if (allowRefresh) resolvingRef.current = true
      try {
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (error || !data) {
          apply(nextSession, { currentLevel: null, nextLevel: null }, error?.message ?? 'Could not check two-factor authentication.')
          return
        }
        const nextAssurance = {
          currentLevel: data.currentLevel,
          nextLevel: data.nextLevel,
        }
        if (allowRefresh && data.currentLevel === 'aal2' && data.nextLevel === 'aal1' && !refreshOnce.current) {
          refreshOnce.current = true
          const refreshed = await supabase.auth.refreshSession()
          if (refreshed.data.session) {
            await resolve(refreshed.data.session, false)
            return
          }
        }
        apply(nextSession, nextAssurance, null)
      } finally {
        if (allowRefresh) {
          refreshOnce.current = false
          resolvingRef.current = false
        }
      }
    },
    [apply],
  )

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      const next = data.session
      if (!next) {
        apply(null, { currentLevel: null, nextLevel: null }, null)
        setLoading(false)
        return
      }
      void resolve(next).finally(() => {
        if (mounted) setLoading(false)
      })
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'INITIAL_SESSION') return
      if (!next || event === 'SIGNED_OUT') {
        holdRef.current = null
        apply(null, { currentLevel: null, nextLevel: null }, null)
        return
      }
      sessionRef.current = next
      setSession(next)
      if (
        (event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') &&
        (resolvingRef.current || refreshOnce.current)
      ) {
        apply(next, assuranceRef.current, null)
        return
      }
      window.setTimeout(() => {
        void resolve(next)
      }, 0)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [apply, resolve])

  useEffect(() => {
    const user = session?.user
    const name = user?.user_metadata?.workspace_name
    const idCode = user?.user_metadata?.workspace_id_code
    if (!user || typeof name !== 'string' || !name.trim()) return
    let cancelled = false
    void ensureSignupWorkspace(user.id, name, typeof idCode === 'string' ? idCode : undefined)
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

  const setHold = useCallback((hold: MfaHold) => {
    holdRef.current = hold
    const current = sessionRef.current
    if (!current) return
    setGate(computeGate(current, assuranceRef.current, hold))
  }, [])

  const refreshAssurance = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      apply(null, { currentLevel: null, nextLevel: null }, null)
      return
    }
    await resolve(data.session)
  }, [apply, resolve])

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      gate,
      assurance,
      assuranceError,
      setHold,
      refreshAssurance,
    }),
    [assurance, assuranceError, gate, loading, refreshAssurance, session, setHold],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
