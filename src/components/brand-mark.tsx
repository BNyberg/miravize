import { cn } from '@/lib/utils'

export function BrandMark({
  className,
  onLight = false,
}: {
  className?: string
  onLight?: boolean
}) {
  return (
    <span className={cn('relative inline-block size-5 shrink-0', className)}>
      <img
        src="/logo-black.png"
        alt=""
        className={cn('size-full object-contain', onLight ? '' : 'dark:hidden')}
      />
      {onLight ? null : (
        <img src="/logo-white.png" alt="" className="hidden size-full object-contain dark:block" />
      )}
    </span>
  )
}
