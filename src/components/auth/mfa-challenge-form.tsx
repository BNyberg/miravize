import { useState } from 'react'

import { AuthSweepCopy } from '@/components/auth/auth-sweep-copy'
import { OtpCodeField } from '@/components/auth/otp-code-field'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/auth-context'
import { OTP_LENGTH, clearAuthenticatorEnroll, otpButtonLabel } from '@/features/auth/mfa'
import { functionError } from '@/lib/function-error'
import { supabase } from '@/lib/supabase'

export function MfaChallengeForm({
  onVerified,
  onBackupRedeemed,
}: {
  onVerified: () => void
  onBackupRedeemed: () => void
}) {
  const { refreshAssurance } = useAuth()
  const [code, setCode] = useState('')
  const [backup, setBackup] = useState(false)
  const [backupCode, setBackupCode] = useState('')
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    const factors = await supabase.auth.mfa.listFactors()
    if (factors.error) {
      setPending(false)
      toast.error("Couldn't check authenticator", { description: factors.error.message })
      return
    }
    const factor = factors.data.totp.find((item) => item.status === 'verified') ?? factors.data.totp[0]
    if (!factor) {
      setPending(false)
      toast.error("Couldn't check authenticator", { description: 'No authenticator is enrolled.' })
      return
    }
    const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id })
    if (challenge.error) {
      setPending(false)
      toast.error("Couldn't check authenticator", { description: challenge.error.message })
      return
    }
    const verified = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.data.id,
      code,
    })
    if (verified.error) {
      setPending(false)
      setCode('')
      toast.error("Couldn't log in", { description: verified.error.message })
      return
    }
    await refreshAssurance()
    onVerified()
  }

  async function redeem(event: React.FormEvent) {
    event.preventDefault()
    if (pending || !backupCode.trim()) return
    setPending(true)
    const { error } = await supabase.functions.invoke('redeem-backup-code', {
      body: { code: backupCode },
    })
    if (error) {
      setPending(false)
      toast.error("Couldn't use backup code", { description: await functionError(error, 'That backup code is not valid.') })
      return
    }
    clearAuthenticatorEnroll()
    await supabase.auth.refreshSession()
    await refreshAssurance()
    onBackupRedeemed()
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  if (backup) {
    return (
      <form className="flex flex-col gap-5" onSubmit={(event) => void redeem(event)}>
        <Header title="Use a backup code" subtitle="Each code works once. You'll set up a new authenticator next." />
        <div className="grid gap-1.5">
          <Label htmlFor="backup-code">Backup code</Label>
          <Input
            id="backup-code"
            autoComplete="off"
            autoFocus
            value={backupCode}
            onChange={(event) => setBackupCode(event.target.value)}
          />
        </div>
        <Button type="submit" className="h-10" disabled={pending || !backupCode.trim()} loading={pending}>
          Log in
        </Button>
        <button
          type="button"
          className="text-center text-sm text-[#5e5c57] underline-offset-4 hover:underline"
          onClick={() => setBackup(false)}
        >
          Use authenticator code
        </button>
        <SignOut onClick={() => void signOut()} />
      </form>
    )
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={(event) => void onSubmit(event)}>
      <Header title="Two-factor authentication" subtitle="Enter the code from your authenticator app." />
      <OtpCodeField id="mfa-code" value={code} onChange={setCode} autoFocus />
      <Button type="submit" className="h-10" disabled={pending || code.length < OTP_LENGTH} loading={pending}>
        {otpButtonLabel(code.length, 'Log in')}
      </Button>
      <button
        type="button"
        className="text-center text-sm text-[#5e5c57] underline-offset-4 hover:underline"
        onClick={() => setBackup(true)}
      >
        Lost access? Use a backup code
      </button>
      <SignOut onClick={() => void signOut()} />
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

function SignOut({ onClick }: { onClick: () => void }) {
  return (
    <p className="text-center text-sm text-[#5e5c57]">
      <button type="button" className="underline-offset-4 hover:underline" onClick={onClick}>
        Sign out
      </button>
    </p>
  )
}
