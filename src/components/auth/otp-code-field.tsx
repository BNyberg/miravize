import { useRef } from 'react'

import { OTP_LENGTH, digitsOnly } from '@/features/auth/mfa'
import { cn } from '@/lib/utils'

export function OtpCodeField({
  id,
  value,
  onChange,
  autoFocus = false,
  onComplete,
  label = 'Authentication code',
  length = OTP_LENGTH,
}: {
  id: string
  value: string
  onChange: (next: string) => void
  autoFocus?: boolean
  onComplete?: (code: string) => void
  label?: string
  length?: number
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const digits = Array.from({ length }, (_, index) => value[index] ?? '')

  function setDigit(index: number, next: string) {
    const chars = digits.slice()
    chars[index] = next
    onChange(chars.join(''))
  }

  function focusBox(index: number) {
    refs.current[Math.max(0, Math.min(length - 1, index))]?.focus()
  }

  function take(raw: string) {
    return digitsOnly(raw, length)
  }

  return (
    <div className={cn('grid gap-1.5', length > 6 ? 'grid-cols-8' : 'grid-cols-6')}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node
          }}
          id={index === 0 ? id : undefined}
          name={index === 0 ? 'one-time-code' : undefined}
          value={digit}
          autoFocus={autoFocus && index === 0}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={index === 0 ? length : 1}
          aria-label={index === 0 ? label : `Digit ${index + 1}`}
          className={cn(
            'h-12 w-full rounded-md border border-input bg-white text-center text-lg font-medium text-[#1c1b19] outline-none transition-colors duration-75 hover:bg-muted',
            'focus:bg-white focus:ring-2 focus:ring-ring',
          )}
          onChange={(event) => {
            const next = take(event.target.value)
            if (index === 0 && next.length > 1) {
              onChange(next)
              focusBox(Math.min(length, next.length) - 1)
              if (next.length >= length) onComplete?.(next.slice(0, length))
              return
            }
            const chars = digits.slice()
            chars[index] = next.slice(-1)
            const joined = chars.join('')
            onChange(joined)
            if (next) focusBox(index + 1)
            if (joined.length >= length) onComplete?.(joined)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && !digits[index]) {
              event.preventDefault()
              setDigit(index - 1, '')
              focusBox(index - 1)
              return
            }
            if (event.key === 'ArrowLeft') {
              event.preventDefault()
              focusBox(index - 1)
              return
            }
            if (event.key === 'ArrowRight') {
              event.preventDefault()
              focusBox(index + 1)
            }
          }}
          onPaste={(event) => {
            event.preventDefault()
            const next = take(event.clipboardData.getData('text'))
            onChange(next)
            focusBox(Math.min(length, Math.max(1, next.length)) - 1)
            if (next.length >= length) onComplete?.(next.slice(0, length))
          }}
          onFocus={(event) => event.target.select()}
        />
      ))}
    </div>
  )
}
