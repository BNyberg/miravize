import { useEffect, useRef, useState } from 'react'

import { toast } from '@/components/ui/toast'
import { useAuth } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase'
import { readUserPreferences, samePreferences, type UserPreferences } from '@/lib/user-preferences'

const SAVE_DELAY_MS = 2500

export function useDebouncedPreferences() {
  const { user } = useAuth()
  const saved = readUserPreferences(user)
  const savedRef = useRef(saved)
  const pendingRef = useRef<UserPreferences | null>(null)
  const timerRef = useRef<number | null>(null)
  const inFlightRef = useRef(false)
  const [draft, setDraft] = useState<UserPreferences | null>(null)
  const savedKey = `${saved.currency}:${saved.timer_span}:${saved.timer_zoom}:${saved.theme}`
  savedRef.current = saved

  useEffect(() => {
    if (pendingRef.current && samePreferences(pendingRef.current, savedRef.current)) {
      pendingRef.current = null
      setDraft(null)
    }
  }, [savedKey])

  async function flush() {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (inFlightRef.current) return

    const next = pendingRef.current
    if (!next || samePreferences(next, savedRef.current)) {
      pendingRef.current = null
      setDraft(null)
      return
    }

    pendingRef.current = null
    inFlightRef.current = true
    const { error } = await supabase.auth.updateUser({ data: { preferences: next } })
    inFlightRef.current = false

    if (error) {
      pendingRef.current = pendingRef.current ?? next
      setDraft(pendingRef.current)
      toast({ tone: 'error', title: "Couldn't save preferences", description: error.message })
      return
    }

    savedRef.current = next
    if (pendingRef.current && !samePreferences(pendingRef.current, next)) {
      void flush()
      return
    }
    pendingRef.current = null
    setDraft(null)
  }

  function schedule(patch: Partial<UserPreferences>) {
    const base = pendingRef.current ?? savedRef.current
    const next = { ...base, ...patch }
    if (samePreferences(next, savedRef.current)) {
      pendingRef.current = null
      setDraft(null)
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      return
    }
    pendingRef.current = next
    setDraft(next)
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS)
  }

  useEffect(() => {
    function onPageHide() {
      void flush()
    }
    function onVisibility() {
      if (document.visibilityState === 'hidden') void flush()
    }
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibility)
      void flush()
    }
  }, [])

  return { preferences: draft ?? saved, schedule }
}
