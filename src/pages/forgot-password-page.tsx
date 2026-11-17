import { useState } from 'react'
import { Link } from 'react-router'

import { AuthSweepCopy } from '@/components/auth/auth-sweep-copy'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { isValidEmail } from '@/lib/email'
import { supabase } from '@/lib/supabase'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const emailInvalid = email.length > 0 && !isValidEmail(email)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidEmail(email) || pending) return
    setPending(true)
    setMessage(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setPending(false)
    if (error) {
      toast({ tone: 'error', title: "Couldn't send reset email", description: error.message })
      return
    }
    setMessage('Check your email for a link to choose a new password.')
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => void onSubmit(e)}>
      <div className="flex flex-col items-center gap-3 text-center">
        <BrandMark onLight className="size-16" />
        <div className="grid gap-1">
          <AuthSweepCopy as="h1" className="text-2xl font-medium tracking-tight">
            Reset your password
          </AuthSweepCopy>
          <AuthSweepCopy delay className="text-sm text-[#5e5c57]">
            We will email you a link to choose a new one.
          </AuthSweepCopy>
        </div>
      </div>
      {message ? <p className="text-sm text-[#5e5c57]">{message}</p> : null}
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={emailInvalid}
          aria-describedby={emailInvalid ? 'email-error' : undefined}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {emailInvalid ? (
          <p id="email-error" className="text-sm text-destructive">
            Enter a valid email address.
          </p>
        ) : null}
      </div>
      <Button type="submit" className="h-10" disabled={pending || !isValidEmail(email)}>
        Send reset link
      </Button>
      <p className="text-center text-sm text-[#5e5c57]">
        <Link to="/login" className="font-medium text-[#1c1b19] underline-offset-4 hover:underline">
          Back to log in
        </Link>
      </p>
    </form>
  )
}
