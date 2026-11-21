import { Eye, EyeSlash } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link } from 'react-router'

import { AuthSweepCopy } from '@/components/auth/auth-sweep-copy'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { rememberLoginPassword } from '@/features/crypto/login-secret'
import { isValidEmail } from '@/lib/email'
import { supabase } from '@/lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const emailInvalid = email.length > 0 && !isValidEmail(email)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setPending(false)
    if (err) {
      toast.error("Couldn't sign in", { description: err.message })
      return
    }
    rememberLoginPassword(email, password)
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
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-sm text-[#5e5c57] underline-offset-4 hover:underline">
              Forgot password?
            </Link>
          </div>
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
          <Button type="submit" className="h-10" disabled={pending || !password} loading={pending}>
            Log In
          </Button>
        </div>
        <p className="text-center text-sm text-[#5e5c57]">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="font-medium text-[#1c1b19] underline-offset-4 hover:underline">
            Sign Up
          </Link>
        </p>
      </form>
  )
}
