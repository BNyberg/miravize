export type SplitShare = {
  clientId: string
  percent: number | null
}

export type AllocatedShare = SplitShare & { seconds: number; percent: number }

export function allocateSeconds(totalSeconds: number, splits: SplitShare[]): AllocatedShare[] {
  const numbered = splits.filter((s): s is SplitShare & { percent: number } => s.percent != null)
  if (numbered.length === 0 || totalSeconds <= 0) {
    return numbered.map((s) => ({ ...s, seconds: 0 }))
  }
  const ranked = [...numbered].sort((a, b) => b.percent - a.percent)
  const allocated = ranked.map((s) => ({
    ...s,
    seconds: Math.floor((totalSeconds * s.percent) / 100),
  }))
  const remainder = totalSeconds - allocated.reduce((sum, s) => sum + s.seconds, 0)
  if (allocated[0]) allocated[0].seconds += remainder
  return allocated
}

export function splitsTotal(splits: SplitShare[]): number {
  return Math.round(splits.reduce((sum, s) => sum + (s.percent ?? 0), 0) * 100) / 100
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':')
}

export function formatHours(totalSeconds: number): string {
  return (totalSeconds / 3600).toFixed(2)
}
