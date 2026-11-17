import { Check, Circle, Eye, EyeSlash } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { AuthSweepCopy } from '@/components/auth/auth-sweep-copy'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { useAuth } from '@/features/auth/auth-context'
import { PASSWORD_RULES, passwordIsStrong } from '@/lib/password'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

export function ResetPasswordPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const canSubmit = !pending && passwordIsStrong(password)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setPending(true)
    const { error } = await supabase.auth.updateUser({ password })
    setPending(false)
    if (error) {
      toast({ tone: 'error', title: "Couldn't update password", description: error.message })
      return
    }
    navigate('/timer')
  }

  if (loading) return <p className="text-sm text-[#5e5c57]">Loading…</p>

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <BrandMark onLight className="size-16" />
        <AuthSweepCopy as="h1" className="text-2xl font-medium tracking-tight">
          Reset link required
        </AuthSweepCopy>
        <p className="text-sm text-[#5e5c57]">Open the link in your reset email, then choose a new password.</p>
        <Link to="/forgot-password" className="text-sm font-medium text-[#1c1b19] underline-offset-4 hover:underline">
          Send a new link
        </Link>
      </div>
    )
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => void onSubmit(e)}>
      <div className="flex flex-col items-center gap-3 text-center">
        <BrandMark onLight className="size-16" />
        <AuthSweepCopy as="h1" className="text-2xl font-medium tracking-tight">
          Choose a new password
        </AuthSweepCopy>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            aria-describedby="password-rules"
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
        <ul id="password-rules" className="grid gap-1 pt-1">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.test(password)
            return (
              <li key={rule.id} className={cn('flex items-center gap-2 text-sm', met ? 'text-[#1c1b19]' : 'text-[#5e5c57]')}>
                {met ? <Check className="size-3.5" /> : <Circle className="size-3.5" />}
                {rule.label}
              </li>
            )
          })}
        </ul>
      </div>
      <Button type="submit" className="h-10" disabled={!canSubmit}>
        Save password
      </Button>
    </form>
  )
}
