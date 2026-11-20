import { useEffect } from 'react'

import { archiveInvites } from '@/features/crypto/audit-log'

export function ArchiveInvites() {
  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        if (!cancelled) await archiveInvites()
      } catch {
        // A later pass records the invite once the workspace key is open.
      }
    }
    void run()
    const timer = window.setInterval(() => void run(), 4000)
    window.addEventListener('focus', run)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', run)
    }
  }, [])

  return null
}
