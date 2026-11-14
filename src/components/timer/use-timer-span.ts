import { useCallback, useEffect, useState } from 'react'

import { useAuth } from '@/features/auth/auth-context'
import { parseTimerSpan, readUserPreferences, type TimerSpan } from '@/lib/user-preferences'

export type { TimerSpan }

const KEY = 'timer-grid-span'
const DEFAULT_SPAN: TimerSpan = 5

function readStored(): TimerSpan | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw == null) return null
    return parseTimerSpan(Number(raw))
  } catch {
    return null
  }
}

function writeStored(span: TimerSpan) {
  try {
    localStorage.setItem(KEY, String(span))
  } catch {
    /* ignore quota / private mode */
  }
}

export function useTimerSpan() {
  const { user } = useAuth()
  const [span, setSpanState] = useState<TimerSpan>(() => readStored() ?? DEFAULT_SPAN)

  useEffect(() => {
    if (readStored() != null) return
    setSpanState(readUserPreferences(user).timer_span)
  }, [user])

  const setSpan = useCallback((next: TimerSpan) => {
    const clamped = parseTimerSpan(next) ?? DEFAULT_SPAN
    setSpanState(clamped)
    writeStored(clamped)
  }, [])

  return [span, setSpan] as const
}
