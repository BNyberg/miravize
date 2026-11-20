import { Eye, EyeSlash } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { AuthSweepCopy } from '@/components/auth/auth-sweep-copy'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { useAuth } from '@/features/auth/auth-context'
import { useOnboardingStatus } from '@/features/onboarding/use-onboarding'
import {
  RECOVERY_CONFIRMATION,
  createProvenAccountKeys,
  loadCryptoProfile,
  saveReadyProfile,
} from '@/lib/crypto/account-profile'
import { formatRecoveryKey, type AccountKeyBundle } from '@/lib/crypto/account-keys'
import { zeroBytes } from '@/lib/crypto/bytes'
import { supabase } from '@/lib/supabase'

function recoveryFile(recoveryKey: string) {
  return [
    'Miravize encryption recovery key',
    '',
    'This is not a two-factor backup code.',
    'Keep it somewhere safe, away from your password.',
    'If you leave setup before it finishes, this key is not saved.',
    '',
    formatRecoveryKey(recoveryKey),
    '',
  ].join('\n')
}

export function EncryptionSetupPage() {
  const onboarding = useOnboardingStatus()
  const { user } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const requested = params.get('next') || '/timer'
  const next = requested.startsWith('/encryption-setup') ? '/timer' : requested
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const passwordRef = useRef('')
  const [showPassword, setShowPassword] = useState(false)
  const [bundle, setBundle] = useState<AccountKeyBundle | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)
  const confirmed = confirmation.trim().toLowerCase() === RECOVERY_CONFIRMATION

  useEffect(() => {
    if (!onboarding.loading && onboarding.state && !onboarding.complete) {
      navigate('/onboarding', { replace: true })
    }
  }, [navigate, onboarding.complete, onboarding.loading, onboarding.state])

  useEffect(() => {
    let cancelled = false
    void loadCryptoProfile()
      .then((profile) => {
        if (cancelled) return
        if (profile?.crypto_status === 'ready') {
          navigate(next, { replace: true })
          return
        }
        setChecking(false)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setChecking(false)
        toast({
          tone: 'error',
          title: "Couldn't check encryption setup",
          description: error instanceof Error ? error.message : 'Try again.',
        })
      })
    return () => {
      cancelled = true
    }
  }, [navigate, next])

  async function createKeys(event: React.FormEvent) {
    event.preventDefault()
    if (pending || !user || password.length === 0) return
    const email = user.email
    if (!email) {
      toast({ tone: 'error', title: "Couldn't check password", description: 'This account has no email.' })
      return
    }
    setPending(true)
    const typed = password
    try {
      const existing = await loadCryptoProfile()
      if (existing?.crypto_status === 'ready') {
        navigate(next, { replace: true })
        return
      }
      const created = await createProvenAccountKeys(user.id, email, typed)
      passwordRef.current = typed
      setPassword('')
      setBundle(created)
    } catch (error) {
      toast({
        tone: 'error',
        title: "Couldn't create encryption keys",
        description: error instanceof Error ? error.message : 'Try again.',
      })
    } finally {
      setPending(false)
    }
  }

  async function finish(event: React.FormEvent) {
    event.preventDefault()
    if (!bundle || !user || !confirmed || pending || passwordRef.current.length === 0) return
    setPending(true)
    try {
      await saveReadyProfile(user.id, bundle, passwordRef.current)
      passwordRef.current = ''
      zeroBytes(bundle.privateKey)
      setBundle(null)
      navigate(next, { replace: true })
    } catch (error) {
      toast({
        tone: 'error',
        title: "Couldn't save encryption keys",
        description: error instanceof Error ? error.message : 'Try again.',
      })
    } finally {
      setPending(false)
    }
  }

  async function copyKey() {
    if (!bundle) return
    try {
      await navigator.clipboard.writeText(formatRecoveryKey(bundle.recoveryKey))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
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
    if (!bundle) return
    const file = new Blob([recoveryFile(bundle.recoveryKey)], { type: 'text/plain' })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = 'miravize-encryption-recovery-key.txt'
    link.click()
    URL.revokeObjectURL(url)
  }

  if (checking) {
    return (
      <div className="flex flex-col gap-5">
        <Header title="Set up encryption" subtitle="Checking your encryption key." />
      </div>
    )
  }

  if (bundle) {
    return (
      <form className="flex flex-col gap-5" onSubmit={(event) => void finish(event)}>
        <Header
          title="Save your recovery key"
          subtitle="Write this down or download it. It is the only way back in if you forget your password. It is not a two-factor code. Leaving before Complete discards it."
        />
        <div className="grid gap-1.5">
          <p className="text-center text-sm text-[#5e5c57]">Recovery key</p>
          <p className="break-all rounded-md border border-[#ddd9d2] bg-[#f4f3ef] px-4 py-3 text-center font-mono text-sm tracking-wide text-[#1c1b19]">
            {formatRecoveryKey(bundle.recoveryKey)}
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
        <SignOut />
      </form>
    )
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={(event) => void createKeys(event)}>
      <Header
        title="Set up encryption"
        subtitle="Enter your current password. This creates your encryption key. Your existing names stay readable."
      />
      <div className="grid gap-1.5">
        <Label htmlFor="encryption-password">Current password</Label>
        <div className="relative">
          <Input
            id="encryption-password"
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
      <SignOut />
    </form>
  )
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
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

function SignOut() {
  return (
    <p className="text-center text-sm text-[#5e5c57]">
      <button type="button" className="underline-offset-4 hover:underline" onClick={() => void supabase.auth.signOut()}>
        Sign out
      </button>
    </p>
  )
}
