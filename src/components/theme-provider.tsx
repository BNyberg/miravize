import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes'
import { type ReactNode, useEffect, useRef } from 'react'

import { useAuth } from '@/features/auth/auth-context'
import { readUserPreferences } from '@/lib/user-preferences'

function FaviconSync() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const href = resolvedTheme === 'light' ? '/favicon-light.png' : '/favicon.png'
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.type = 'image/png'
    link.href = href
  }, [resolvedTheme])

  return null
}

export function SeedSavedTheme() {
  const { user } = useAuth()
  const { setTheme } = useTheme()
  const seeded = useRef(false)

  useEffect(() => {
    if (seeded.current || !user) return
    seeded.current = true
    try {
      if (localStorage.getItem('theme') != null) return
    } catch {
      return
    }
    setTheme(readUserPreferences(user).theme)
  }, [setTheme, user])

  return null
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <FaviconSync />
      {children}
    </NextThemesProvider>
  )
}
