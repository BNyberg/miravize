import { Eye, EyeSlash } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { OnboardingProgress } from '@/components/onboarding/onboarding-progress'
import { OtpCodeField } from '@/components/auth/otp-code-field'
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
import { toast } from 'sonner'
import { encodeWorkspaceIcon, IconChooser, WorkspaceMark } from '@/components/workspaces/workspace-icon'
import { useAuth } from '@/features/auth/auth-context'
import {
  BACKUP_CONFIRMATION,
  OTP_LENGTH,
  backupCodesText,
  clearAuthenticatorEnroll,
  createBackupCodes,
  enrollAuthenticator,
  factorIsMissing,
  groupSecret,
  metadataFlag,
  qrSource,
  replaceBackupCodes,
} from '@/features/auth/mfa'
import { loginPasswordFor, rememberLoginPassword } from '@/features/crypto/login-secret'
import {
  createProvenAccountKeys,
  loadCryptoProfile,
  promotePendingProfile,
  replacePendingRecovery,
  savePendingProfile,
} from '@/lib/crypto/account-profile'
import { formatRecoveryKey } from '@/lib/crypto/account-keys'
import { zeroBytes } from '@/lib/crypto/bytes'
import { supabase } from '@/lib/supabase'

import { clearRecoveryKey, readRecoveryKey, rememberRecoveryKey } from '@/features/onboarding/recovery-store'
import { randomGroupIndex, recoveryGroupMatches, recoveryGroups } from '@/features/onboarding/recovery-check'
import { useOnboardingStatus, useRefreshOnboarding } from '@/features/onboarding/use-onboarding'
import { finishOnboardingWorkspace, loadOnboardingWorkspace, type OnboardingWorkspace } from '@/features/onboarding/workspace'
import { suggestWorkspaceIdCode, workspaceIdInput } from '@/lib/workspace-id-code'

const STORAGE_KEY = 'miravize-workspace-id'

export function OnboardingPage() {
  const { user, gate } = useAuth()
  const onboarding = useOnboardingStatus()
  const refresh = useRefreshOnboarding()
  const navigate = useNavigate()
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (onboarding.step === 'done') navigate('/timer', { replace: true })
  }, [navigate, onboarding.step])

  if (!user || onboarding.loading || !onboarding.step || onboarding.step === 'done') {
    return null
  }
  if (onboarding.error) {
    return (
      <div className="grid content-center gap-3 text-center">
        <p className="text-sm text-[#5e5c57]">Couldn't check your setup.</p>
        <Button type="button" onClick={() => void onboarding.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  const step = onboarding.step

  return (
    <div className="flex flex-col gap-5">
      <OnboardingProgress step={done ? 'workspace' : step} />
      {done ? (
        <Heading title="You're ready" subtitle="Taking you to your timer." />
      ) : step === 'verify' ? (
        <VerifyStep email={user.email ?? ''} />
      ) : step === 'mfa' ? (
        <MfaStep
          backupFirst={gate === 'backup' || metadataFlag(user.user_metadata, 'mfa_backup_pending')}
          onDone={async () => {
            await refresh()
          }}
        />
      ) : step === 'recovery' ? (
        <RecoveryStep
          userId={user.id}
          email={user.email ?? ''}
          cryptoStatus={onboarding.state?.cryptoStatus ?? null}
          onDone={async () => {
            await refresh()
          }}
        />
      ) : (
        <WorkspaceStep
          email={user.email ?? ''}
          onDone={() => {
            setDone(true)
            window.setTimeout(() => navigate('/timer', { replace: true }), 700)
          }}
        />
      )}
    </div>
  )
}

function VerifyStep({ email }: { email: string }) {
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)

  async function verify(token: string) {
    if (pending || token.length < 8) return
    setPending(true)
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' })
    setPending(false)
    if (error) {
      setCode('')
      toast.error("Couldn't verify email", { description: error.message })
    }
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        void verify(code)
      }}
    >
      <Heading title="Check your email" subtitle={`Enter the 8-digit code sent to ${email}.`} />
      <OtpCodeField id="onboarding-code" label="Confirmation code" length={8} value={code} onChange={setCode} autoFocus onComplete={(next) => void verify(next)} />
      <Button type="submit" className="h-10" disabled={pending || code.length < 8} loading={pending}>
        Verify email
      </Button>
      <SignOut />
    </form>
  )
}

function MfaStep({ backupFirst, onDone }: { backupFirst: boolean; onDone: () => Promise<void> }) {
  const { setHold, refreshAssurance, assurance } = useAuth()
  const [mode, setMode] = useState<'choose' | 'enroll' | 'backup'>(backupFirst ? 'backup' : 'choose')
  const [factorId, setFactorId] = useState('')
  const [qr, setQr] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [deviceName, setDeviceName] = useState('')
  const [codes, setCodes] = useState<string[]>([])
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)

  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    if (mode !== 'enroll') return
    let alive = true
    void enrollAuthenticator().then((result) => {
      if (!alive) return
      if ('error' in result) {
        toast.error("Couldn't start setup", { description: result.error })
        return
      }
      if ('verified' in result) {
        void recordChoice('enrolled')
          .then(() => onDoneRef.current())
          .catch((error: Error) => toast.error("Couldn't save your choice", { description: error.message }))
        return
      }
      setFactorId(result.id)
      setQr(result.qr)
      setSecret(result.secret)
    })
    return () => {
      alive = false
    }
  }, [mode])

  useEffect(() => {
    if (mode !== 'backup' || codes.length > 0 || assurance.currentLevel !== 'aal2') return
    const nextCodes = createBackupCodes()
    setCodes(nextCodes)
    void replaceBackupCodes(nextCodes).catch((error: Error) => {
      setCodes([])
      toast.error("Couldn't save backup codes", { description: error.message })
    })
  }, [assurance.currentLevel, codes.length, mode])

  async function verifyCode(token: string) {
    if (pending || token.length < OTP_LENGTH || !factorId) return
    setPending(true)
    setHold('backup')
    const challenge = await supabase.auth.mfa.challenge({ factorId })
    if (challenge.error) {
      setHold(null)
      setPending(false)
      toast.error("Couldn't verify code", { description: challenge.error.message })
      return
    }
    const verified = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: token })
    if (verified.error) {
      setHold(null)
      setPending(false)
      setCode('')
      toast.error("Couldn't verify code", { description: verified.error.message })
      return
    }
    const nextCodes = createBackupCodes()
    try {
      await replaceBackupCodes(nextCodes)
    } catch (error) {
      setHold(null)
      setPending(false)
      toast.error("Couldn't save backup codes", { description: error instanceof Error ? error.message : 'Try again.' })
      return
    }
    const saved = await supabase.auth.updateUser({
      data: {
        mfa_backup_pending: true,
        mfa_reenroll_required: false,
        mfa_setup_skipped: false,
        mfa_device_name: deviceName.trim() || 'Authenticator',
      },
    })
    if (saved.error) toast.error("Couldn't save authenticator", { description: saved.error.message })
    else {
      await supabase.auth.refreshSession()
      await refreshAssurance()
    }
    setCodes(nextCodes)
    setPending(false)
    setMode('backup')
  }

  async function skip() {
    if (pending) return
    setPending(true)
    if (factorId) {
      const removed = await supabase.auth.mfa.unenroll({ factorId })
      if (removed.error && !factorIsMissing(removed.error)) {
        setPending(false)
        toast.error("Couldn't skip setup", { description: removed.error.message })
        return
      }
    }
    const saved = await supabase.auth.updateUser({ data: { mfa_setup_skipped: true, mfa_reenroll_required: false } })
    if (saved.error) {
      setPending(false)
      toast.error("Couldn't skip setup", { description: saved.error.message })
      return
    }
    const recorded = await supabase.rpc('record_onboarding_mfa_choice', { p_choice: 'skipped' })
    setPending(false)
    if (recorded.error) {
      toast.error("Couldn't save your choice", { description: recorded.error.message })
      return
    }
    setHold(null)
    clearAuthenticatorEnroll()
    await refreshAssurance()
    await onDone()
  }

  async function finishBackup() {
    if (pending || confirmation.trim().toLowerCase() !== BACKUP_CONFIRMATION) return
    setPending(true)
    const saved = await supabase.auth.updateUser({
      data: { mfa_backup_pending: false, mfa_reenroll_required: false, mfa_setup_skipped: false },
    })
    if (saved.error) {
      setPending(false)
      toast.error("Couldn't finish setup", { description: saved.error.message })
      return
    }
    const refreshed = await supabase.auth.refreshSession()
    if (refreshed.error) {
      setPending(false)
      toast.error("Couldn't finish setup", { description: refreshed.error.message })
      return
    }
    const recorded = await supabase.rpc('record_onboarding_mfa_choice', { p_choice: 'enrolled' })
    setPending(false)
    if (recorded.error) {
      toast.error("Couldn't save your choice", { description: recorded.error.message })
      return
    }
    setHold(null)
    await refreshAssurance()
    await onDone()
  }

  if (mode === 'choose') {
    return (
      <div className="flex flex-col gap-5">
        <Heading
          title="Add an extra layer of security"
          subtitle="Protect your account with a verification code from your authenticator app."
        />
        <Button type="button" className="h-10" onClick={() => setMode('enroll')}>
          Set up two-factor authentication
        </Button>
        <Button type="button" variant="outline" className="h-10" onClick={() => void skip()} disabled={pending} loading={pending}>
          Skip for now
        </Button>
        <p className="text-center text-sm text-[#5e5c57]">You can turn this on later from your profile. Workspaces that require it will still ask for a code.</p>
        <SignOut />
      </div>
    )
  }

  if (mode === 'backup') {
    return (
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          void finishBackup()
        }}
      >
        <Heading title="Save your backup codes" subtitle="Store these somewhere safe. Each code works once if you lose your authenticator." />
        <ul className="grid grid-cols-2 gap-y-2 rounded-md border border-[#ddd9d2] bg-[#f4f3ef] px-4 py-3 font-mono text-sm">
          {codes.map((item) => (
            <li key={item} className="text-center tracking-wide">
              {item}
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={codes.length === 0}
            onClick={() => void navigator.clipboard.writeText(codes.join('\n')).then(
              () => toast.success('Backup codes copied'),
              () => toast.error("Couldn't copy backup codes", { description: 'Copy them manually.' }),
            )}
          >
            Copy
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={codes.length === 0}
            onClick={() => downloadText('miravize-backup-codes.txt', backupCodesText(codes))}
          >
            Download
          </Button>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="backup-confirm">Type “I saved my codes”</Label>
          <Input id="backup-confirm" autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </div>
        <Button type="submit" className="h-10" disabled={confirmation.trim().toLowerCase() !== BACKUP_CONFIRMATION || pending || codes.length === 0} loading={pending}>
          Continue
        </Button>
      </form>
    )
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        void verifyCode(code)
      }}
    >
      <Heading title="Set up your authenticator" subtitle="Use Google Authenticator, Microsoft Authenticator, 1Password, or any other TOTP app." />
      <div className="flex flex-col items-center gap-3">
        {qr ? (
          <img src={qrSource(qr)} alt="Authenticator QR code" className="size-52 rounded-md border border-[#ddd9d2] bg-white p-2" />
        ) : (
          <div className="size-52 rounded-md border border-[#ddd9d2] bg-[#f4f3ef]" />
        )}
        {secret ? <p className="text-center font-mono text-sm tracking-wide text-[#5e5c57]">{groupSecret(secret)}</p> : null}
      </div>
      <OtpCodeField id="mfa-code" value={code} onChange={setCode} autoFocus onComplete={(next) => void verifyCode(next)} />
      <div className="grid gap-1.5">
        <Label htmlFor="device-name">Device name</Label>
        <Input
          id="device-name"
          autoComplete="off"
          placeholder="Optional"
          value={deviceName}
          onChange={(event) => setDeviceName(event.target.value)}
        />
      </div>
      <Button type="submit" className="h-10" disabled={pending || code.length < OTP_LENGTH || !factorId} loading={pending}>
        Verify code
      </Button>
      <Button type="button" variant="ghost" onClick={() => void skip()} disabled={pending}>
        Skip for now
      </Button>
    </form>
  )
}

async function recordChoice(choice: 'enrolled' | 'skipped') {
  const recorded = await supabase.rpc('record_onboarding_mfa_choice', { p_choice: choice })
  if (recorded.error) throw new Error(recorded.error.message)
}

type RecoveryPrepareResult =
  | { ok: true; key: string; replaced: boolean }
  | { ok: false; reason: 'ready' | 'error'; message: string }

let recoveryPrepareTask: Promise<RecoveryPrepareResult> | null = null

function prepareRecoveryKey(input: { userId: string; email: string; password: string }) {
  if (recoveryPrepareTask) return recoveryPrepareTask
  recoveryPrepareTask = createRecoveryKey(input).finally(() => {
    recoveryPrepareTask = null
  })
  return recoveryPrepareTask
}

async function createRecoveryKey(input: { userId: string; email: string; password: string }): Promise<RecoveryPrepareResult> {
  try {
    const profile = await loadCryptoProfile()
    if (profile?.crypto_status === 'ready') {
      return { ok: false, reason: 'ready', message: 'A new key was not created.' }
    }
    let nextKey = readRecoveryKey()
    let replaced = false
    if (profile?.crypto_status === 'setup_pending' && !nextKey) {
      nextKey = await replacePendingRecovery(input.userId, input.email, input.password)
      replaced = true
    } else if (!profile) {
      const bundle = await createProvenAccountKeys(input.userId, input.email, input.password)
      try {
        await savePendingProfile(input.userId, bundle, input.password)
        nextKey = bundle.recoveryKey
      } finally {
        zeroBytes(bundle.privateKey)
      }
    }
    if (!nextKey) {
      return { ok: false, reason: 'error', message: 'The recovery key is no longer in this browser. Enter your password to continue.' }
    }
    rememberLoginPassword(input.email, input.password)
    rememberRecoveryKey(nextKey)
    return { ok: true, key: nextKey, replaced }
  } catch (error) {
    return { ok: false, reason: 'error', message: error instanceof Error ? error.message : 'Try again.' }
  }
}

function RecoveryStep({
  userId,
  email,
  cryptoStatus,
  onDone,
}: {
  userId: string
  email: string
  cryptoStatus: 'setup_pending' | 'ready' | null
  onDone: () => Promise<void>
}) {
  const cachedPassword = loginPasswordFor(email) ?? ''
  const [password, setPassword] = useState(cachedPassword)
  const [showPassword, setShowPassword] = useState(false)
  const [recoveryKey, setRecoveryKey] = useState<string | null>(() => readRecoveryKey())
  const [view, setView] = useState<'save' | 'confirm'>('save')
  const [groupIndex, setGroupIndex] = useState<number | null>(null)
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(false)
  const [replaced, setReplaced] = useState(false)
  const [autoFailed, setAutoFailed] = useState(false)
  const formatted = recoveryKey ? formatRecoveryKey(recoveryKey) : ''

  function applyRecoveryPrepare(result: RecoveryPrepareResult) {
    if (result.ok) {
      setReplaced(result.replaced)
      setRecoveryKey(result.key)
      return
    }
    setAutoFailed(true)
    if (result.reason === 'ready') {
      toast.error('Enter a group from your saved recovery key', { description: result.message })
      return
    }
    toast.error("Couldn't prepare your recovery key", { description: result.message })
  }

  useEffect(() => {
    if (!recoveryKey || groupIndex != null) return
    setGroupIndex(randomGroupIndex(recoveryGroups(formatRecoveryKey(recoveryKey)).length))
  }, [groupIndex, recoveryKey])

  useEffect(() => {
    if (recoveryKey || cachedPassword.length === 0 || readRecoveryKey()) return
    let cancelled = false
    void prepareRecoveryKey({ userId, email, password: cachedPassword }).then((result) => {
      if (cancelled) return
      applyRecoveryPrepare(result)
    })
    return () => {
      cancelled = true
    }
  }, [cachedPassword, email, recoveryKey, userId])

  async function prepare() {
    if (pending || password.length === 0) return
    setPending(true)
    try {
      applyRecoveryPrepare(await prepareRecoveryKey({ userId, email, password }))
    } finally {
      setPending(false)
    }
  }

  async function confirm() {
    if (pending || !recoveryKey || groupIndex == null) return
    if (!recoveryGroupMatches(formatRecoveryKey(recoveryKey), groupIndex, typed)) {
      toast.error("That doesn't match", { description: `Check the ${ordinal(groupIndex + 1)} group and try again.` })
      return
    }
    setPending(true)
    try {
      if (cryptoStatus !== 'ready') await promotePendingProfile(userId)
      const confirmed = await supabase.rpc('confirm_onboarding_recovery')
      if (confirmed.error) throw new Error(confirmed.error.message)
      clearRecoveryKey()
      await onDone()
    } catch (error) {
      toast.error("Couldn't save your recovery key", { description: error instanceof Error ? error.message : 'Try again.' })
    } finally {
      setPending(false)
    }
  }

  if (!recoveryKey && cachedPassword.length > 0 && !autoFailed) {
    return (
      <div className="flex flex-col gap-5">
        <Heading title="Secure your encrypted data" subtitle="Creating your recovery key." />
      </div>
    )
  }

  if (!recoveryKey) {
    return (
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          void prepare()
        }}
      >
        <Heading
          title="Secure your encrypted data"
          subtitle={
            cryptoStatus === 'setup_pending'
              ? 'The previous recovery key left this browser, so it is no longer valid. Enter your password to create a replacement.'
              : 'This browser no longer has the password from when you created your account. Enter it to create your recovery key.'
          }
        />
        <div className="grid gap-1.5">
          <Label htmlFor="recovery-password">Password</Label>
          <div className="relative">
            <Input
              id="recovery-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="pr-10"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button type="button" className="absolute inset-y-0 right-0 px-3 text-[#5e5c57]" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((open) => !open)}>
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

  const groups = recoveryGroups(formatted)
  const groupMatches = recoveryKey != null && groupIndex != null && recoveryGroupMatches(formatted, groupIndex, typed)

  if (view === 'confirm') {
    return (
      <form
        key="recovery-confirm"
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          void confirm()
        }}
      >
        <Heading
          title="Confirm your recovery key"
          subtitle="To make sure you've saved your recovery key, enter the requested characters from your saved copy."
        />
        <div className="grid gap-1.5">
          <Label htmlFor="recovery-group">
            {groupIndex == null ? 'Group of characters' : `${ordinal(groupIndex + 1)} group of characters`}
          </Label>
          <Input
            id="recovery-group"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            className="font-mono"
          />
        </div>
        <Button type="submit" className="h-10" disabled={pending || !groupMatches} loading={pending}>
          Verify and continue
        </Button>
        <Button type="button" variant="ghost" onClick={() => setView('save')} disabled={pending}>
          Back
        </Button>
      </form>
    )
  }

  return (
    <form key="recovery-save" className="flex flex-col gap-5">
      <Heading
        title="Save your recovery key"
        subtitle="Your workspace information is protected with encryption. Save this recovery key somewhere safe so you can restore access if you forget your password."
      />
      {replaced ? (
        <p className="text-sm text-[#5e5c57]">The previous key is no longer valid. Save this one instead.</p>
      ) : null}
      <RecoveryKeyGroups groups={groups} />
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-10"
          onClick={() => void navigator.clipboard.writeText(formatted).then(
            () => toast.success('Recovery key copied'),
            () => toast.error("Couldn't copy recovery key", { description: 'Copy it manually.' }),
          )}
        >
          Copy
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10"
          onClick={() =>
            downloadText(
              'miravize-encryption-recovery-key.txt',
              `Miravize encryption recovery key\n\nKeep this somewhere safe, away from your password.\nLosing both your password and this key can make encrypted data inaccessible.\n\n${formatted}\n`,
            )
          }
        >
          Download
        </Button>
      </div>
      <p className="text-sm text-[#5e5c57]">
        If you lose both your password and recovery key, you will permanently lose access to your encrypted data. Miravize <span className="font-bold">cannot</span> recover it for you.
      </p>
      <Button type="button" className="h-10" onClick={() => setView('confirm')}>
        I've saved my recovery key
      </Button>
      <SignOut />
    </form>
  )
}

function RecoveryKeyGroups({ groups }: { groups: string[] }) {
  return (
    <div className="grid grid-cols-4 gap-x-2 gap-y-3 rounded-md border border-[#ddd9d2] bg-[#f4f3ef] px-3 py-3">
      {groups.map((group, index) => (
        <div key={index} className="flex flex-col items-center gap-1">
          <span aria-hidden className="pointer-events-none select-none text-[10px] leading-none tabular-nums text-[#8a867e]">
            {index + 1}
          </span>
          <span className="font-mono text-sm tracking-wide">{group}</span>
        </div>
      ))}
    </div>
  )
}

function ordinal(value: number) {
  const mod100 = value % 100
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`
  if (value % 10 === 1) return `${value}st`
  if (value % 10 === 2) return `${value}nd`
  if (value % 10 === 3) return `${value}rd`
  return `${value}th`
}

function WorkspaceStep({ email, onDone }: { email: string; onDone: () => void }) {
  const [name, setName] = useState('')
  const [idCode, setIdCode] = useState('')
  const [confirmSuggested, setConfirmSuggested] = useState(false)
  const [hero, setHero] = useState<string | null>(null)
  const [custom, setCustom] = useState('')
  const [existing, setExisting] = useState<OnboardingWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const needsPassword = loginPasswordFor(email) == null
  const icon = encodeWorkspaceIcon(custom, hero)
  const suggestion = suggestWorkspaceIdCode(name)

  useEffect(() => {
    let alive = true
    void loadOnboardingWorkspace()
      .then((workspace) => {
        if (alive) setExisting(workspace)
      })
      .catch((error: Error) => {
        toast.error("Couldn't check your workspace", { description: error.message })
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  async function create(workspaceName: string, chosenId = '', chosenIcon: string | null = null) {
    if (pending) return false
    setPending(true)
    try {
      const workspace = existing ?? (await loadOnboardingWorkspace({ name: workspaceName, idCode: chosenId, icon: chosenIcon }))
      if (!workspace) throw new Error('Enter a workspace name.')
      if (workspace.role === 'owner') {
        const currentPassword = loginPasswordFor(email) ?? passwordInput
        if (!currentPassword) throw new Error('Enter your password to unlock the workspace.')
        rememberLoginPassword(email, currentPassword)
        await finishOnboardingWorkspace(email, currentPassword, workspace)
      }
      const completed = await supabase.rpc('complete_onboarding')
      if (completed.error) throw new Error(completed.error.message)
      const workspaceId = typeof completed.data === 'string' ? completed.data : workspace.id
      localStorage.setItem(STORAGE_KEY, workspaceId)
      onDone()
      return true
    } catch (error) {
      toast.error("Couldn't create your workspace", { description: error instanceof Error ? error.message : 'Try again.' })
      return false
    } finally {
      setPending(false)
    }
  }

  if (loading) return <div className="min-h-40" />

  if (existing) {
    const label = existing.name.trim() || existing.id_code
    return (
      <div className="flex flex-col gap-5">
        <Heading title="Your workspace is ready" subtitle={`${label} will hold your time entries, projects, clients, and activities.`} />
        {needsPassword ? <WorkspacePassword value={passwordInput} onChange={setPasswordInput} /> : null}
        <Button type="button" className="h-10" onClick={() => void create(existing.name)} disabled={pending || (needsPassword && passwordInput.length === 0)} loading={pending}>
          Continue
        </Button>
        <SignOut />
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (!name.trim() || !icon.ok) return
        if (!idCode.trim() && suggestion) {
          setConfirmSuggested(true)
          return
        }
        void create(name.trim(), idCode.trim() || suggestion, icon.value)
      }}
    >
      <Heading
        title="Let's create your first workspace"
        subtitle="A workspace organizes time entries, projects, clients, and activities. The name is encrypted on this device."
      />
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_4.5rem] items-end gap-x-2 gap-y-1.5">
        <Label htmlFor="workspace-name" className="col-start-2 row-start-1">
          Workspace name
        </Label>
        <Label htmlFor="workspace-id" className="col-start-3 row-start-1">
          ID
        </Label>
        <IconChooser
          hero={hero}
          custom={custom}
          onHero={(value) => {
            setHero(value)
            setCustom('')
          }}
          onCustom={(value) => {
            setCustom(value)
            if (value.trim()) setHero(null)
          }}
        >
          <button
            type="button"
            aria-label="Choose icon"
            className="col-start-1 row-start-2 inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#ddd9d2]"
          >
            <WorkspaceMark icon={icon.ok ? icon.value : null} />
          </button>
        </IconChooser>
        <Input
          id="workspace-name"
          className="col-start-2 row-start-2 h-9"
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          id="workspace-id"
          className="col-start-3 row-start-2 h-9 text-center uppercase"
          placeholder={suggestion}
          value={idCode}
          onChange={(event) => setIdCode(workspaceIdInput(event.target.value))}
        />
      </div>
      {needsPassword ? <WorkspacePassword value={passwordInput} onChange={setPasswordInput} /> : null}
      <Button type="submit" className="h-10" disabled={pending || name.trim().length === 0 || !icon.ok || (needsPassword && passwordInput.length === 0)} loading={pending && !confirmSuggested}>
        Create workspace
      </Button>
      <SignOut />
      <Dialog open={confirmSuggested} onOpenChange={(open) => { if (!open && !pending) setConfirmSuggested(false) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Use the suggested task ID?</DialogTitle>
            <DialogDescription>
              Your tasks and requests will use IDs like T-{suggestion}01 and R-{suggestion}01. You can customize the prefix before creating your workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmSuggested(false)} disabled={pending}>
              Go back
            </Button>
            <Button
              type="button"
              loading={pending}
              onClick={() => {
                if (!icon.ok) return
                void create(name.trim(), suggestion, icon.value).then((created) => {
                  if (created) setConfirmSuggested(false)
                })
              }}
            >
              Use suggested ID and create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}

function WorkspacePassword({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="workspace-password">Password</Label>
      <div className="relative">
        <Input
          id="workspace-password"
          type={shown ? 'text' : 'password'}
          autoComplete="current-password"
          className="pr-10"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" className="absolute inset-y-0 right-0 px-3 text-[#5e5c57]" aria-label={shown ? 'Hide password' : 'Show password'} onClick={() => setShown((open) => !open)}>
          {shown ? <EyeSlash className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
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
        <AuthSweepCopy delay className="whitespace-pre-line text-sm text-[#5e5c57]">
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

function downloadText(filename: string, contents: string) {
  const file = new Blob([contents], { type: 'text/plain' })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
