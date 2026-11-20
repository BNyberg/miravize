import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Outlet, useLocation } from 'react-router'

import { SeigaihaPanel } from '@/components/auth/seigaiha-panel'

const formTone = {
  colorScheme: 'light',
  background: '#ffffff',
  color: '#1c1b19',
  '--background': '#ffffff',
  '--foreground': '#1c1b19',
  '--muted': '#f4f3ef',
  '--muted-foreground': '#5e5c57',
  '--border': '#ddd9d2',
  '--input': '#ddd9d2',
  '--primary': '#1f7a4d',
  '--primary-foreground': '#ffffff',
  '--ring': '#1f7a4d',
  '--destructive': '#b42318',
  '--card': '#ffffff',
  '--card-foreground': '#1c1b19',
} as CSSProperties

export function AuthShell() {
  const location = useLocation()
  const wide = location.pathname.startsWith('/onboarding')
  const innerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number>()
  const [contentHeight, setContentHeight] = useState(0)

  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    const node = el

    function apply() {
      const next = node.scrollHeight
      const max = window.innerHeight - 32
      setContentHeight(next)
      setHeight(Math.min(next, max))
    }

    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(node)
    window.addEventListener('resize', apply)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', apply)
    }
  }, [])

  return (
    <div className="relative min-h-svh overflow-hidden">
      <div className="absolute inset-0">
        <SeigaihaPanel />
      </div>
      <div
        className={`absolute top-1/2 left-4 right-4 z-10 w-auto -translate-y-1/2 rounded-md bg-white shadow-[0_16px_48px_rgba(28,27,25,0.18)] transition-[height] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:left-1/2 sm:right-auto sm:-translate-x-1/2 ${wide ? 'sm:w-[520px]' : 'sm:w-[440px]'}`}
        style={{
          ...formTone,
          height,
          overflowY: height != null && contentHeight > height ? 'auto' : 'hidden',
        }}
      >
        <div ref={innerRef} className="p-8">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
