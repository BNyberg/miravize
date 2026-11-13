import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import './auth-sweep-copy.css'

export function AuthSweepCopy({
  as: Tag = 'p',
  delay = false,
  className,
  children,
}: {
  as?: 'h1' | 'p'
  delay?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <Tag className={cn('auth-sweep', delay && 'auth-sweep-delay', className)}>{children}</Tag>
  )
}
