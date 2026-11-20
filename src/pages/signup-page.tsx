import { Eye, EyeSlash } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import { OnboardingProgress } from '@/components/onboarding/onboarding-progress'
import { OtpCodeField } from '@/components/auth/otp-code-field'
import { AuthSweepCopy } from '@/components/auth/auth-sweep-copy'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { rememberLoginPassword } from '@/features/crypto/login-secret'
import { isValidEmail } from '@/lib/email'
import { PASSWORD_RULES, passwordIsStrong } from '@/lib/password'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const EMAIL_KEY = 'miravize-onboarding-email'
const INVITE_KEY = 'miravize-onboarding-invite'
const AWAITING_KEY = 'miravize-onboarding-awaiting-code'
const RESEND_SECONDS = 60

type Phase = 'email' | 'password' | 'verify'

function storedEmail() {
  return sessionStorage.getItem(EMAIL_KEY) ?? ''
}

function storedInvite() {
  return sessionStorage.getItem(INVITE_KEY) ?? ''
}

export function SignupPage() {
  const [phase, setPhase] = useState<Phase>(() => (sessionStorage.getItem(AWAITING_KEY) === '1' ? 'verify' : 'email'))
  const [email, setEmail] = useState(storedEmail)
  const [invite, setInvite] = useState(storedInvite)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const verifying = useRef(false)

  const emailInvalid = email.length > 0 && !isValidEmail(email)
  const mismatch = confirm.length > 0 && confirm !== password
  const inviteReady = invite.trim().length > 0
  const canContinue = isValidEmail(email) && inviteReady
  const canCreate = canContinue && passwordIsStrong(password) && password === confirm

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  async function continueFromEmail() {
    if (!canContinue || pending) return
    setPending(true)
    const { data, error } = await supabase.rpc('beta_invite_open', { p_code: invite.trim() })
    setPending(false)
    if (error) {
      toast({ tone: 'error', title: "Couldn't check invite code", description: error.message })
      return
    }
    if (data !== true) {
      toast({ tone: 'error', title: "Couldn't check invite code", description: "That invite code isn't valid." })
      return
    }
    sessionStorage.setItem(EMAIL_KEY, email.trim())
    sessionStorage.setItem(INVITE_KEY, invite.trim())
    setPhase('password')
  }

  async function createAccount() {
    if (!canCreate || pending) return
    setPending(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { invite_code: invite.trim() } },
    })
    setPending(false)
    if (error && !/already registered/i.test(error.message)) {
      toast({ tone: 'error', title: "Couldn't create account", description: error.message })
      if (/invite code|database error/i.test(error.message)) setPhase('email')
      return
    }
    rememberLoginPassword(email.trim(), password)
    sessionStorage.setItem(EMAIL_KEY, email.trim())
    sessionStorage.removeItem(INVITE_KEY)
    sessionStorage.setItem(AWAITING_KEY, '1')
    if (data?.session) return
    setPassword('')
    setConfirm('')
    setPhase('verify')
    setCooldown(RESEND_SECONDS)
  }

  async function verify(token: string) {
    if (verifying.current || token.length < 8) return
    verifying.current = true
    setPending(true)
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: 'signup',
    })
    verifying.current = false
    setPending(false)
    if (error) {
      setCode('')
      toast({ tone: 'error', title: "Couldn't verify email", description: error.message })
    }
  }

  async function resend() {
    if (cooldown > 0 || pending) return
    setPending(true)
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() })
    setPending(false)
    if (error) {
      toast({ tone: 'error', title: "Couldn't resend code", description: error.message })
      return
    }
    setCooldown(RESEND_SECONDS)
    toast({ tone: 'success', title: 'Confirmation code sent', description: `Check ${email.trim()}.` })
  }

  return (
    <div className="flex flex-col gap-5 motion-reduce:transition-none">
      <OnboardingProgress step={phase} />
      {phase === 'email' ? (
        <form
          className="flex flex-1 flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            void continueFromEmail()
          }}
        >
          <Heading title="What's your email?" subtitle="You'll use this to sign in." />
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              aria-invalid={emailInvalid}
              aria-describedby={emailInvalid ? 'signup-email-error' : undefined}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {emailInvalid ? (
              <p id="signup-email-error" className="text-sm text-destructive">
                Enter a valid email address.
              </p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="invite-code">Invite code</Label>
            <Input
              id="invite-code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              value={invite}
              onChange={(event) => setInvite(event.target.value)}
            />
          </div>
          <Button type="submit" className="h-10" disabled={!canContinue || pending} loading={pending}>
            Continue
          </Button>
          <Footer />
        </form>
      ) : null}
      {phase === 'password' ? (
        <form
          className="flex flex-1 flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            void createAccount()
          }}
        >
          <Heading title="Create a password" subtitle="This also protects your encrypted data." />
          <PasswordField
            id="password"
            label="Password"
            autoComplete="new-password"
            value={password}
            shown={showPassword}
            onToggle={() => setShowPassword((open) => !open)}
            onChange={setPassword}
          />
          <ul className="grid gap-1 text-sm text-[#5e5c57]">
            {PASSWORD_RULES.map((rule) => (
              <li key={rule.id} className={cn(rule.test(password) && 'text-[#1f7a4d]')}>
                {rule.label}
              </li>
            ))}
          </ul>
          <PasswordField
            id="confirm-password"
            label="Confirm password"
            autoComplete="new-password"
            value={confirm}
            shown={showPassword}
            onToggle={() => setShowPassword((open) => !open)}
            onChange={setConfirm}
          />
          {mismatch ? <p className="text-sm text-destructive">Passwords do not match.</p> : null}
          <Button type="submit" className="h-10" disabled={!canCreate || pending} loading={pending}>
            Continue
          </Button>
          <button type="button" className="text-sm text-[#5e5c57] underline-offset-4 hover:underline" onClick={() => setPhase('email')}>
            Use a different email
          </button>
        </form>
      ) : null}
      {phase === 'verify' ? (
        <form
          className="flex flex-1 flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            void verify(code)
          }}
        >
          <Heading title="Check your email" subtitle={`Enter the 8-digit code sent to ${email.trim()}.`} />
          <OtpCodeField
            id="signup-code"
            label="Confirmation code"
            length={8}
            value={code}
            onChange={setCode}
            autoFocus
            onComplete={(next) => void verify(next)}
          />
          <Button type="submit" className="h-10" disabled={pending || code.length < 8} loading={pending}>
            Verify email
          </Button>
          <button
            type="button"
            className="text-sm text-[#5e5c57] underline-offset-4 hover:underline disabled:opacity-50"
            disabled={pending || cooldown > 0}
            onClick={() => void resend()}
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </button>
          <Footer />
        </form>
      ) : null}
    </div>
  )
}

function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <BrandMark onLight className="size-16" />
      <div className="grid gap-1">
        <AuthSweepCopy as="h1" className="text-2xl font-medium tracking-tight">
          {title}
        </AuthSweepCopy>
        <AuthSweepCopy delay className="text-sm text-[#5e5c57]">
          {subtitle}
        </AuthSweepCopy>
      </div>
    </div>
  )
}

function Footer() {
  return (
    <p className="text-center text-sm text-[#5e5c57]">
      Already have an account?{' '}
      <Link to="/login" className="font-medium text-[#1c1b19] underline-offset-4 hover:underline">
        Sign in
      </Link>
    </p>
  )
}

function PasswordField({
  id,
  label,
  value,
  shown,
  autoComplete,
  onChange,
  onToggle,
}: {
  id: string
  label: string
  value: string
  shown: boolean
  autoComplete: string
  onChange: (value: string) => void
  onToggle: () => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          className="pr-10"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex items-center px-3 text-[#5e5c57]"
          onClick={onToggle}
          aria-label={shown ? 'Hide password' : 'Show password'}
        >
          {shown ? <EyeSlash className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  )
}
