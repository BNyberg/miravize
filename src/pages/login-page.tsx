import { Eye, EyeSlash } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { AuthSocialButtons } from '@/components/auth/auth-social-buttons'
import { AuthSweepCopy } from '@/components/auth/auth-sweep-copy'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isValidEmail } from '@/lib/email'
import { supabase } from '@/lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = params.get('next') || '/timer'
  const emailInvalid = email.length > 0 && !isValidEmail(email)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setPending(false)
    if (err) setError(err.message)
    else navigate(next)
  }

  async function magicLink() {
    setPending(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setPending(false)
    if (err) setError(err.message)
    else setMessage('Check your email for a magic link.')
  }

  return (
      <form className="flex flex-col gap-5" onSubmit={(e) => void onSubmit(e)}>
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMark onLight className="size-16" />
          <div className="grid gap-1">
            <AuthSweepCopy as="h1" className="text-2xl font-medium tracking-tight">
              Welcome back!
            </AuthSweepCopy>
            <AuthSweepCopy delay className="text-sm text-[#5e5c57]">
              Please enter your details
            </AuthSweepCopy>
          </div>
        </div>
        {error ? (
          <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
            {error}
          </div>
        ) : null}
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
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex items-center px-3 text-[#5e5c57]"
              onClick={() => setShowPassword((open) => !open)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeSlash className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        <div className="grid gap-2">
          <Button type="submit" className="h-10" disabled={pending || !password}>
            Log In
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-9 text-sm text-[#5e5c57]"
            disabled={pending || !isValidEmail(email)}
            onClick={() => void magicLink()}
          >
            Email magic link
          </Button>
        </div>
        <AuthSocialButtons />
        <p className="text-center text-sm text-[#5e5c57]">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="font-medium text-[#1c1b19] underline-offset-4 hover:underline">
            Sign Up
          </Link>
        </p>
      </form>
  )
}
