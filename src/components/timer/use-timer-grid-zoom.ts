import { useCallback, useState } from 'react'

import { DEFAULT_ZOOM, ZOOM_STEPS } from './week-layout'

const KEY = 'timer-grid-zoom'

function nearestStep(value: number) {
  return ZOOM_STEPS.reduce((closest, step) =>
    Math.abs(step - value) < Math.abs(closest - value) ? step : closest,
  )
}

function readStored() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw == null) return DEFAULT_ZOOM
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return DEFAULT_ZOOM
    return nearestStep(parsed)
  } catch {
    return DEFAULT_ZOOM
  }
}

function writeStored(zoom: number) {
  try {
    localStorage.setItem(KEY, String(zoom))
  } catch {
    /* ignore quota / private mode */
  }
}

export function useTimerGridZoom() {
  const [zoom, setZoom] = useState(readStored)
  const index = ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number])
  const stepIndex = index === -1 ? ZOOM_STEPS.indexOf(DEFAULT_ZOOM) : index

  const set = useCallback((next: number) => {
    const clamped = nearestStep(next)
    setZoom(clamped)
    writeStored(clamped)
  }, [])

  const zoomOut = useCallback(() => {
    setZoom((current) => {
      const at = ZOOM_STEPS.indexOf(current as (typeof ZOOM_STEPS)[number])
      const next = ZOOM_STEPS[Math.max(0, (at === -1 ? ZOOM_STEPS.indexOf(DEFAULT_ZOOM) : at) - 1)]
      writeStored(next)
      return next
    })
  }, [])

  const zoomIn = useCallback(() => {
    setZoom((current) => {
      const at = ZOOM_STEPS.indexOf(current as (typeof ZOOM_STEPS)[number])
      const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, (at === -1 ? ZOOM_STEPS.indexOf(DEFAULT_ZOOM) : at) + 1)]
      writeStored(next)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    set(DEFAULT_ZOOM)
  }, [set])

  return {
    zoom,
    canZoomOut: stepIndex > 0,
    canZoomIn: stepIndex < ZOOM_STEPS.length - 1,
    canReset: zoom !== DEFAULT_ZOOM,
    zoomOut,
    zoomIn,
    reset,
  }
}
