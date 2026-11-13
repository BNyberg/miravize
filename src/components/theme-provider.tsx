import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes'
import { type ReactNode, useEffect } from 'react'

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

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <FaviconSync />
      {children}
    </NextThemesProvider>
  )
}
