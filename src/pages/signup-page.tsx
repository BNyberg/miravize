import { Check, Circle } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isValidEmail } from '@/lib/email'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (value: string) => value.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { id: 'lower', label: 'One lowercase letter', test: (value: string) => /[a-z]/.test(value) },
  { id: 'number', label: 'One number', test: (value: string) => /\d/.test(value) },
  { id: 'special', label: 'One special character', test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const

function passwordIsStrong(value: string) {
  return PASSWORD_RULES.every((rule) => rule.test(value))
}

export function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [workspaceName, setWorkspaceName] = useState('Personal')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const emailInvalid = email.length > 0 && !isValidEmail(email)
  const canSubmit =
    !pending && isValidEmail(email) && passwordIsStrong(password) && workspaceName.trim().length > 0

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setPending(true)
    setError(null)
    const name = workspaceName.trim() || 'Personal'
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { workspace_name: name },
      },
    })
    if (err) {
      setPending(false)
      setError(err.message)
      return
    }
    setPending(false)
    if (!data.session) {
      setMessage('Check your email to confirm the account, then sign in. Your workspace is created with the account.')
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create account</CardTitle>
          <CardDescription>Start with a workspace you can invite people into later.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={(e) => void onSubmit(e)}>
            {error ? (
              <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
                {error}
              </div>
            ) : null}
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
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
              <Input
                id="password"
                type="password"
                required
                aria-required
                aria-describedby="password-rules"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <ul id="password-rules" className="grid gap-1 pt-1">
                {PASSWORD_RULES.map((rule) => {
                  const met = rule.test(password)
                  return (
                    <li
                      key={rule.id}
                      className={cn(
                        'flex items-center gap-2 text-sm',
                        met ? 'text-foreground' : 'text-muted-foreground',
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
              <Input
                id="workspace"
                required
                aria-required
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={!canSubmit}>
              Create account
            </Button>
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="text-primary underline-offset-4 hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
