import { Camera } from '@phosphor-icons/react'
import { useState } from 'react'

import { AvatarDialog } from '@/components/account/avatar-dialog'
import { cn } from '@/lib/utils'

function initialsFromEmail(email: string | undefined) {
  const local = email?.split('@')[0] ?? ''
  const letters = local.replace(/[^a-zA-Z]/g, '')
  if (letters.length >= 2) return letters.slice(0, 2).toUpperCase()
  if (local.length >= 2) return local.slice(0, 2).toUpperCase()
  return (email?.slice(0, 2) ?? '?').toUpperCase()
}

export function AccountPhoto({
  email,
  avatarUrl,
  className,
}: {
  email: string | undefined
  avatarUrl: string | undefined
  className?: string
}) {
  if (avatarUrl) return <img src={avatarUrl} alt="" className={cn('size-full object-cover', className)} />
  return <span className={cn('text-xs font-medium', className)}>{initialsFromEmail(email)}</span>
}

export function AccountAvatar({
  email,
  avatarUrl,
  size,
}: {
  email: string | undefined
  avatarUrl: string | undefined
  size: 'sm' | 'lg'
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className={cn(
          'group relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border font-medium',
          size === 'sm' ? 'size-8 text-xs' : 'size-20 text-sm',
        )}
        aria-label="Change profile picture"
        onClick={() => setOpen(true)}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="size-full object-cover" />
        ) : (
          initialsFromEmail(email)
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera aria-hidden="true" className={size === 'sm' ? 'size-4' : 'size-5'} />
        </span>
      </button>
      <AvatarDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
