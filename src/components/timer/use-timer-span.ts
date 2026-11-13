import { useCallback, useState } from 'react'

export type TimerSpan = 1 | 5 | 7

const KEY = 'timer-grid-span'
const SPANS: TimerSpan[] = [1, 5, 7]
const DEFAULT_SPAN: TimerSpan = 5

function parseSpan(value: number): TimerSpan | null {
  return SPANS.includes(value as TimerSpan) ? (value as TimerSpan) : null
}

function readStored(): TimerSpan {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw == null) return DEFAULT_SPAN
    const parsed = Number(raw)
    return parseSpan(parsed) ?? DEFAULT_SPAN
  } catch {
    return DEFAULT_SPAN
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
  const [span, setSpanState] = useState<TimerSpan>(readStored)

  const setSpan = useCallback((next: TimerSpan) => {
    const clamped = parseSpan(next) ?? DEFAULT_SPAN
    setSpanState(clamped)
    writeStored(clamped)
  }, [])

  return [span, setSpan] as const
}
