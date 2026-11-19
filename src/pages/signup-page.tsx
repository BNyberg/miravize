import { Check, Circle, Eye, EyeSlash } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link } from 'react-router'

import { AuthSocialButtons } from '@/components/auth/auth-social-buttons'
import { AuthSweepCopy } from '@/components/auth/auth-sweep-copy'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isValidEmail } from '@/lib/email'
import { PASSWORD_RULES, passwordIsStrong } from '@/lib/password'
import { supabase } from '@/lib/supabase'
import { suggestWorkspaceIdCode, workspaceIdInput } from '@/lib/workspace-id-code'
import { cn } from '@/lib/utils'

export function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [workspaceName, setWorkspaceName] = useState('Personal')
  const [idCode, setIdCode] = useState('')
  const [idConfirm, setIdConfirm] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const emailInvalid = email.length > 0 && !isValidEmail(email)
  const suggestion = suggestWorkspaceIdCode(workspaceName)
  const confirmedCode = (idConfirm ?? '').trim() || suggestion
  const canSubmit =
    !pending && isValidEmail(email) && passwordIsStrong(password) && workspaceName.trim().length > 0

  async function createAccount(code: string) {
    setPending(true)
    setError(null)
    setIdConfirm(null)
    const name = workspaceName.trim() || 'Personal'
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { workspace_name: name, workspace_id_code: code },
      },
    })
    setPending(false)
    if (err) {
      setError(err.message)
      return
    }
    if (!data.session) {
      setMessage('Check your email to confirm the account, then sign in. Your workspace is created with the account.')
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    if (!idCode.trim()) {
      setIdConfirm(suggestion)
      return
    }
    void createAccount(idCode.trim())
  }

  return (
      <form className="flex flex-col gap-5" onSubmit={(e) => void onSubmit(e)}>
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMark onLight className="size-16" />
          <div className="grid gap-1">
            <AuthSweepCopy as="h1" className="text-2xl font-medium tracking-tight">
              Create your account
            </AuthSweepCopy>
            <AuthSweepCopy delay className="text-sm text-[#5e5c57]">
              Start with a workspace you can invite people into later.
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
          <Label htmlFor="email">
            Email <span className="text-destructive">*</span>
          </Label>
          <Input
            id="email"
            type="email"
            required
            aria-required
            aria-invalid={emailInvalid}
            aria-describedby={emailInvalid ? 'signup-email-error' : undefined}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {emailInvalid ? (
            <p id="signup-email-error" className="text-sm text-destructive">
              Enter a valid email address.
            </p>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">
            Password <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              aria-required
              aria-describedby="password-rules"
              autoComplete="new-password"
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
                <li
                  key={rule.id}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    met ? 'text-[#1c1b19]' : 'text-[#5e5c57]',
                  )}
                >
                  {met ? (
                    <Check className="size-4 text-primary" weight="bold" aria-hidden />
                  ) : (
                    <Circle className="size-4" aria-hidden />
                  )}
                  {rule.label}
                </li>
              )
            })}
          </ul>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="workspace">
            First workspace <span className="text-destructive">*</span>
          </Label>
          <div className="flex gap-2">
            <Input
              id="workspace"
              required
              aria-required
              className="min-w-0 flex-1"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
            />
            <Input
              aria-label="ID"
              className="w-[3.4rem] uppercase"
              placeholder={suggestion}
              value={idCode}
              onChange={(e) => setIdCode(workspaceIdInput(e.target.value))}
            />
          </div>
        </div>
        <Dialog open={idConfirm !== null} onOpenChange={(open) => { if (!open) setIdConfirm(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Use ID {confirmedCode}?</DialogTitle>
              <DialogDescription>
                Tasks and requests will look like T-{confirmedCode}01 and R-{confirmedCode}01.
              </DialogDescription>
            </DialogHeader>
            <Input
              aria-label="ID"
              className="h-9 uppercase"
              value={idConfirm ?? ''}
              onChange={(e) => setIdConfirm(workspaceIdInput(e.target.value))}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIdConfirm(null)}>
                Cancel
              </Button>
              <Button type="button" disabled={!confirmedCode || pending} onClick={() => void createAccount(confirmedCode)}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button type="submit" className="h-10" disabled={!canSubmit}>
          Create account
        </Button>
        <AuthSocialButtons />
        <p className="text-center text-sm text-[#5e5c57]">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-[#1c1b19] underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
  )
}
