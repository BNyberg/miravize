import { startOfDay } from 'date-fns'

import type { TimeEntry } from '@/types'

export const DEFAULT_HOUR_PX = 64
export const HOUR_PX = DEFAULT_HOUR_PX
export const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2, 2.5, 3] as const
export const DEFAULT_ZOOM = 1
export const SNAP_MS = 15 * 60 * 1000
export const DAY_MS = 24 * 60 * 60 * 1000

export function hourPxFor(zoom: number) {
  return DEFAULT_HOUR_PX * zoom
}

const LABEL_PX_MIN = 12
const LABEL_PX_MAX = 14
const ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1]

export function labelPxFor(zoom: number) {
  const t = (zoom - DEFAULT_ZOOM) / (ZOOM_MAX - DEFAULT_ZOOM)
  return Math.min(LABEL_PX_MAX, Math.max(LABEL_PX_MIN, LABEL_PX_MIN + t * (LABEL_PX_MAX - LABEL_PX_MIN)))
}

export function snap(ms: number) {
  return Math.round(ms / SNAP_MS) * SNAP_MS
}

export function dayBounds(day: Date) {
  const start = startOfDay(day).getTime()
  return { start, end: start + DAY_MS }
}

export function topFor(ms: number, day: Date, hourPx = DEFAULT_HOUR_PX) {
  return ((ms - dayBounds(day).start) / DAY_MS) * 24 * hourPx
}

export function heightFor(start: number, end: number, hourPx = DEFAULT_HOUR_PX) {
  return Math.max(((end - start) / DAY_MS) * 24 * hourPx, 16)
}

export function inkOn(hex: string) {
  const value = hex.replace('#', '')
  if (value.length < 6) return '#1C1B19'
  const channel = (index: number) => parseInt(value.slice(index, index + 2), 16) / 255
  const linear = (channel: number) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  const luminance =
    0.2126 * linear(channel(0)) + 0.7152 * linear(channel(2)) + 0.0722 * linear(channel(4))
  return luminance > 0.42 ? '#1C1B19' : '#F4F3EF'
}

export type DaySlice = {
  entry: TimeEntry
  start: number
  end: number
  lane: number
  lanes: number
}

export function layoutDay(entries: TimeEntry[], day: Date, now: number): DaySlice[] {
  const bounds = dayBounds(day)
  const slices: DaySlice[] = []
  for (const entry of entries) {
    const start = new Date(entry.started_at).getTime()
    const end = entry.stopped_at ? new Date(entry.stopped_at).getTime() : now
    if (end <= bounds.start || start >= bounds.end) continue
    slices.push({
      entry,
      start: Math.max(start, bounds.start),
      end: Math.min(Math.max(end, start + 60_000), bounds.end),
      lane: 0,
      lanes: 1,
    })
  }
  slices.sort((a, b) => a.start - b.start || a.end - b.end)

  const laneEnds: number[] = []
  for (const slice of slices) {
    let lane = laneEnds.findIndex((end) => end <= slice.start + 1000)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(slice.end)
    } else {
      laneEnds[lane] = slice.end
    }
    slice.lane = lane
  }

  const groups: DaySlice[][] = []
  let current: DaySlice[] = []
  let groupEnd = -Infinity
  for (const slice of slices) {
    if (current.length > 0 && slice.start >= groupEnd) {
      groups.push(current)
      current = []
      groupEnd = -Infinity
    }
    current.push(slice)
    groupEnd = Math.max(groupEnd, slice.end)
  }
  if (current.length > 0) groups.push(current)
  for (const group of groups) {
    const count = Math.max(...group.map((slice) => slice.lane)) + 1
    for (const slice of group) slice.lanes = count
  }
  return slices
}
