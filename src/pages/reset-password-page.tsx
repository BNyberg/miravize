import { Check, Circle, Eye, EyeSlash } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { AuthSweepCopy } from '@/components/auth/auth-sweep-copy'
import { MfaChallengeForm } from '@/components/auth/mfa-challenge-form'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { useAuth } from '@/features/auth/auth-context'
import { metadataFlag } from '@/features/auth/mfa'
import { passwordMatchesCurrent } from '@/features/auth/verify-password'
import { rememberLoginPassword } from '@/features/crypto/login-secret'
import {
  RECOVERY_CONFIRMATION,
  commitPasswordRewrapFromRecovery,
  commitRecoveryRotation,
  loadCryptoProfile,
  prepareRecoveryRotation,
  type RecoveryReplacement,
} from '@/lib/crypto/account-profile'
import { formatRecoveryKey } from '@/lib/crypto/account-keys'
import { DIFFERENT_PASSWORD_RULE, PASSWORD_RULES, isSamePasswordError, passwordIsStrong } from '@/lib/password'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type PasswordCheck = {
  password: string
  status: 'checking' | 'different' | 'same' | 'skipped'
}

function recoveryFile(recoveryKey: string) {
  return [
    'Miravize encryption recovery key',
    '',
    'This replaces your previous encryption recovery key after you confirm it is saved.',
    'Until you confirm, the previous key still works.',
    'This is not a two-factor backup code.',
    'Keep it somewhere safe, away from your password.',
    '',
    formatRecoveryKey(recoveryKey),
    '',
  ].join('\n')
}

export function ResetPasswordPage() {
  const { user, loading, assurance } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const passwordRef = useRef('')
  const [recoveryKey, setRecoveryKey] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [passedChallenge, setPassedChallenge] = useState(false)
  const [reenroll, setReenroll] = useState(false)
  const [cryptoReady, setCryptoReady] = useState<boolean | null>(null)
  const [rotationPending, setRotationPending] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileAttempt, setProfileAttempt] = useState(0)
  const [replacement, setReplacement] = useState<RecoveryReplacement | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [copied, setCopied] = useState(false)
  const [passwordCheck, setPasswordCheck] = useState<PasswordCheck | null>(null)
  const needsChallenge =
    !passedChallenge && assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2'
  const confirmed = confirmation.trim().toLowerCase() === RECOVERY_CONFIRMATION
  const choosingPassword =
    Boolean(user?.email) &&
    !loading &&
    !needsChallenge &&
    !profileError &&
    cryptoReady !== null &&
    !replacement &&
    !rotationPending
  const passwordStatus = passwordCheck?.password === password ? passwordCheck.status : null
  const passwordIsDifferent = passwordStatus === 'different'
  const reuseAllowed = passwordStatus === 'different' || passwordStatus === 'skipped'
  const canSubmit =
    !pending &&
    passwordIsStrong(password) &&
    reuseAllowed &&
    cryptoReady !== null &&
    (!cryptoReady || recoveryKey.trim().length > 0)
  const passwordRules = [
    ...PASSWORD_RULES,
    {
      ...DIFFERENT_PASSWORD_RULE,
      test: () => passwordIsDifferent,
    },
  ]

  useEffect(() => {
    if (loading || !user?.id || needsChallenge) return
    let cancelled = false
    void loadCryptoProfile()
      .then((profile) => {
        if (cancelled) return
        setProfileError(null)
        setCryptoReady(profile?.crypto_status === 'ready')
        if (profile?.recovery_rotation_pending) setRotationPending(true)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const description = error instanceof Error ? error.message : 'Try again.'
        setCryptoReady(null)
        setProfileError(description)
        toast({ tone: 'error', title: "Couldn't check encryption", description })
      })
    return () => {
      cancelled = true
    }
  }, [loading, needsChallenge, profileAttempt, user?.id])

  useEffect(() => {
    const email = user?.email
    if (!choosingPassword || !email || !passwordIsStrong(password)) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return
      setPasswordCheck({ password, status: 'checking' })
      void passwordMatchesCurrent(email, password)
        .then((matches) => {
          if (cancelled) return
          setPasswordCheck({ password, status: matches ? 'same' : 'different' })
        })
        .catch((error: unknown) => {
          if (cancelled) return
          setPasswordCheck({ password, status: 'skipped' })
          const description = error instanceof Error ? error.message : 'Try again.'
          toast({ tone: 'error', title: "Couldn't check password", description })
        })
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [choosingPassword, password, user?.email])

  function continueAfterReset() {
    if (user?.email) rememberLoginPassword(user.email, passwordRef.current)
    const setup = reenroll || metadataFlag(user?.user_metadata, 'mfa_reenroll_required')
    navigate(setup ? '/mfa/setup?next=%2Ftimer' : '/timer')
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || needsChallenge || !user?.email) return
    setPending(true)
    const nextPassword = password
    const typedRecovery = recoveryKey
    let wrapSaved = false
    try {
      const { error } = await supabase.auth.updateUser({ password: nextPassword })
      if (error) {
        if (isSamePasswordError(error)) setPasswordCheck({ password: nextPassword, status: 'same' })
        toast({ tone: 'error', title: "Couldn't update password", description: error.message })
        return
      }
      passwordRef.current = nextPassword
      if (!cryptoReady) {
        continueAfterReset()
        return
      }
      await commitPasswordRewrapFromRecovery(user.id, user.email, nextPassword, typedRecovery, true)
      wrapSaved = true
      setRotationPending(true)
      const created = await prepareRecoveryRotation(user.id, user.email, nextPassword)
      setPassword('')
      setRecoveryKey('')
      setShowPassword(false)
      setConfirmation('')
      setCopied(false)
      setReplacement(created)
    } catch (error) {
      toast({
        tone: 'error',
        title: wrapSaved ? "Couldn't create a new recovery key" : "Couldn't update the encryption key",
        description: error instanceof Error ? error.message : 'Try again.',
      })
    } finally {
      setPending(false)
    }
  }

  async function resume(event: React.FormEvent) {
    event.preventDefault()
    if (pending || !user?.email || password.length === 0) return
    setPending(true)
    const nextPassword = password
    try {
      const created = await prepareRecoveryRotation(user.id, user.email, nextPassword)
      passwordRef.current = nextPassword
      setPassword('')
      setShowPassword(false)
      setConfirmation('')
      setCopied(false)
      setReplacement(created)
    } catch (error) {
      toast({
        tone: 'error',
        title: "Couldn't create a new recovery key",
        description: error instanceof Error ? error.message : 'Try again.',
      })
    } finally {
      setPending(false)
    }
  }

  async function finish(event: React.FormEvent) {
    event.preventDefault()
    if (!replacement || !user?.email || !confirmed || pending || passwordRef.current.length === 0) return
    setPending(true)
    try {
      await commitRecoveryRotation(user.id, user.email, passwordRef.current, replacement)
      continueAfterReset()
    } catch (error) {
      toast({
        tone: 'error',
        title: "Couldn't replace the recovery key",
        description: error instanceof Error ? error.message : 'Try again.',
      })
    } finally {
      setPending(false)
    }
  }

  async function copyKey() {
    if (!replacement) return
    try {
      await navigator.clipboard.writeText(formatRecoveryKey(replacement.recoveryKey))
      setCopied(true)
      toast({ tone: 'success', title: 'Recovery key copied to clipboard.' })
    } catch (error) {
      toast({
        tone: 'error',
        title: "Couldn't copy recovery key",
        description: error instanceof Error ? error.message : 'Try again.',
      })
    }
  }

  function downloadKey() {
    if (!replacement) return
    const file = new Blob([recoveryFile(replacement.recoveryKey)], { type: 'text/plain' })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = 'miravize-encryption-recovery-key.txt'
    link.click()
    URL.revokeObjectURL(url)
  }

  if (loading || (user && !needsChallenge && cryptoReady === null && !profileError)) {
    return <p className="text-sm text-[#5e5c57]">Loading…</p>
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <BrandMark onLight className="size-16" />
        <AuthSweepCopy as="h1" className="text-2xl font-medium tracking-tight">
          Reset link required
        </AuthSweepCopy>
        <p className="text-sm text-[#5e5c57]">Open the link in your reset email, then choose a new password.</p>
        <Link to="/login" className="text-sm font-medium text-[#1c1b19] underline-offset-4 hover:underline">
          Sign in
        </Link>
        <Link to="/forgot-password" className="text-sm text-[#5e5c57] underline-offset-4 hover:underline">
          Send a new link
        </Link>
      </div>
    )
  }

  if (needsChallenge) {
    return (
      <MfaChallengeForm
        onVerified={() => setPassedChallenge(true)}
        onBackupRedeemed={() => {
          setReenroll(true)
          setPassedChallenge(true)
        }}
      />
    )
  }

  if (profileError) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <BrandMark onLight className="size-16" />
        <AuthSweepCopy as="h1" className="text-2xl font-medium tracking-tight">
          Check encryption again
        </AuthSweepCopy>
        <Button
          type="button"
          className="h-10"
          onClick={() => {
            setProfileError(null)
            setProfileAttempt((attempt) => attempt + 1)
          }}
        >
          Try again
        </Button>
      </div>
    )
  }

  if (replacement) {
    return (
      <form className="flex flex-col gap-5" onSubmit={(event) => void finish(event)}>
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMark onLight className="size-16" />
          <div className="grid gap-1">
            <AuthSweepCopy as="h1" className="text-2xl font-medium tracking-tight">
              Save your new recovery key
            </AuthSweepCopy>
            <AuthSweepCopy delay className="text-sm text-[#5e5c57]">
              Write this down or download it. Your password already opens your workspaces. If you leave, coming back asks for that password and shows a new key. The previous recovery key keeps working until you confirm.
            </AuthSweepCopy>
          </div>
        </div>
        <div className="grid gap-1.5">
          <p className="text-center text-sm text-[#5e5c57]">Recovery key</p>
          <p className="break-all rounded-md border border-[#ddd9d2] bg-[#f4f3ef] px-4 py-3 text-center font-mono text-sm tracking-wide text-[#1c1b19]">
            {formatRecoveryKey(replacement.recoveryKey)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="h-10" onClick={() => void copyKey()}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button type="button" variant="outline" className="h-10" onClick={downloadKey}>
            Download
          </Button>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="recovery-confirm">Type “I saved my recovery key”</Label>
          <Input
            id="recovery-confirm"
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>
        <Button type="submit" className="h-10" disabled={!confirmed || pending} loading={pending}>
          Complete
        </Button>
      </form>
    )
  }

  if (rotationPending) {
    return (
      <form className="flex flex-col gap-5" onSubmit={(event) => void resume(event)}>
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMark onLight className="size-16" />
          <div className="grid gap-1">
            <AuthSweepCopy as="h1" className="text-2xl font-medium tracking-tight">
              Finish your recovery key
            </AuthSweepCopy>
            <AuthSweepCopy delay className="text-sm text-[#5e5c57]">
              Enter the password you just saved. The next screen gives you a new recovery key. Your previous recovery key keeps working until you confirm the new one.
            </AuthSweepCopy>
          </div>
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
              onChange={(event) => setPassword(event.target.value)}
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
        <Button type="submit" className="h-10" disabled={pending || password.length === 0} loading={pending}>
          Continue
        </Button>
        <p className="text-center text-sm text-[#5e5c57]">
          <button type="button" className="underline-offset-4 hover:underline" onClick={() => void supabase.auth.signOut()}>
            Sign out
          </button>
        </p>
      </form>
    )
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => void onSubmit(e)}>
      <div className="flex flex-col items-center gap-3 text-center">
        <BrandMark onLight className="size-16" />
        <div className="grid gap-1">
          <AuthSweepCopy as="h1" className="text-2xl font-medium tracking-tight">
            Choose a new password
          </AuthSweepCopy>
          {cryptoReady ? (
            <AuthSweepCopy delay className="text-sm text-[#5e5c57]">
              Enter your current recovery key as well. The next screen replaces it. Until you confirm the new key, this one still works.
            </AuthSweepCopy>
          ) : null}
        </div>
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
          {passwordRules.map((rule) => {
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
      {cryptoReady ? (
        <div className="grid gap-1.5">
          <Label htmlFor="reset-recovery-key">Current recovery key</Label>
          <Textarea
            id="reset-recovery-key"
            autoComplete="off"
            value={recoveryKey}
            onChange={(event) => setRecoveryKey(event.target.value)}
          />
        </div>
      ) : null}
      <Button type="submit" className="h-10" disabled={!canSubmit} loading={pending}>
        Save password
      </Button>
    </form>
  )
}
