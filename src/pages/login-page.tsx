import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isValidEmail } from '@/lib/email'
import { supabase } from '@/lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Genki Tenki</CardTitle>
          <CardDescription>Sign in to track time and requests.</CardDescription>
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
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={pending || !password}>
              Sign in
            </Button>
            <Button type="button" variant="outline" disabled={pending || !isValidEmail(email)} onClick={() => void magicLink()}>
              Email magic link
            </Button>
            <p className="text-sm text-muted-foreground">
              No account? <Link to="/signup" className="text-primary underline-offset-4 hover:underline">Create one</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
