import { Check, Circle, Eye, EyeSlash, X } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'

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
import { toast } from '@/components/ui/toast'
import { changePassword } from '@/features/auth/change-password'
import { useAuth } from '@/features/auth/auth-context'
import {
  BACKUP_CONFIRMATION,
  backupCodesText,
  createBackupCodes,
  clearAuthenticatorEnroll,
  deleteBackupCodes,
  replaceBackupCodes,
} from '@/features/auth/mfa'
import {
  RECOVERY_CONFIRMATION,
  commitRecoveryRotation,
  loadCryptoProfile,
  prepareRecoveryRotation,
  type RecoveryReplacement,
} from '@/lib/crypto/account-profile'
import { formatRecoveryKey } from '@/lib/crypto/account-keys'
import { DIFFERENT_PASSWORD_RULE, PASSWORD_RULES, passwordDiffersFromCurrent, passwordIsStrong } from '@/lib/password'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

export function SecurityCard() {
  const { user, assurance, refreshAssurance } = useAuth()
  const navigate = useNavigate()
  const enrolled = assurance.currentLevel === 'aal2' || assurance.nextLevel === 'aal2'
  const [removeOpen, setRemoveOpen] = useState(false)
  const [codesOpen, setCodesOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [codes, setCodes] = useState<string[]>([])
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)
  const confirmed = confirmation.trim().toLowerCase() === BACKUP_CONFIRMATION
  const encryption = useQuery({
    queryKey: ['crypto-profile', user?.id],
    enabled: Boolean(user),
    queryFn: loadCryptoProfile,
  })

  useEffect(() => {
    if (!encryption.error) return
    toast({
      tone: 'error',
      title: "Couldn't load encryption key",
      description: encryption.error instanceof Error ? encryption.error.message : 'Try again.',
    })
  }, [encryption.error])

  function openCodes() {
    setCodes(createBackupCodes())
    setConfirmation('')
    setCopied(false)
    setCodesOpen(true)
  }

  async function saveCodes() {
    if (!confirmed || pending) return
    setPending(true)
    try {
      await replaceBackupCodes(codes)
      setCodesOpen(false)
    } catch (error) {
      toast({
        tone: 'error',
        title: "Couldn't save backup codes",
        description: error instanceof Error ? error.message : 'Try again.',
      })
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    if (pending) return
    setPending(true)
    try {
      await deleteBackupCodes()
      const listed = await supabase.auth.mfa.listFactors()
      if (listed.error) throw listed.error
      for (const factor of [...listed.data.totp, ...listed.data.phone]) {
        const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id })
        if (removed.error) throw removed.error
      }
      const saved = await supabase.auth.updateUser({
        data: {
          mfa_setup_skipped: true,
          mfa_reenroll_required: false,
          mfa_backup_pending: false,
          mfa_device_name: null,
        },
      })
      if (saved.error) throw saved.error
      await supabase.auth.refreshSession()
      clearAuthenticatorEnroll()
      await refreshAssurance()
      setRemoveOpen(false)
    } catch (error) {
      toast({
        tone: 'error',
        title: "Couldn't remove two-factor authentication",
        description: error instanceof Error ? error.message : 'Try again.',
      })
    } finally {
      setPending(false)
    }
  }

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopied(true)
      toast({ tone: 'success', title: 'Backup codes copied to clipboard.' })
    } catch (error) {
      toast({
        tone: 'error',
        title: "Couldn't copy backup codes",
        description: error instanceof Error ? error.message : 'Try again.',
      })
    }
  }

  function downloadCodes() {
    const file = new Blob([backupCodesText(codes)], { type: 'text/plain' })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = 'miravize-backup-codes.txt'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium">Security</p>
      <section className="rounded-lg border border-border bg-card">
        <SecurityRow
          title="Two-factor authentication"
          description="Protect your account with an authenticator app."
          actions={
            enrolled ? (
              <>
                <Button type="button" variant="outline" onClick={openCodes}>
                  New backup codes
                </Button>
                <Button type="button" variant="outline" onClick={() => setRemoveOpen(true)}>
                  Remove 2FA
                </Button>
              </>
            ) : (
              <Button type="button" onClick={() => navigate('/mfa/setup?return=profile')}>
                Set up 2FA
              </Button>
            )
          }
        />
        <SecurityRow
          title="Password"
          description="Keep your account secure with a strong, unique password."
          actions={
            <Button type="button" variant="outline" onClick={() => setPasswordOpen(true)}>
              Change password
            </Button>
          }
        />
        <SecurityRow
          title="Encryption recovery key"
          description="Restore access to encrypted data if you forget your password."
          actions={
            <Button type="button" variant="outline" onClick={() => setRecoveryOpen(true)}>
              Replace recovery key
            </Button>
          }
        />
      </section>

      <Dialog open={removeOpen} onOpenChange={(open) => { if (!pending) setRemoveOpen(open) }}>
        <DialogContent
          className="w-[calc(100%-2rem)]"
          onEscapeKeyDown={(event) => { if (pending) event.preventDefault() }}
          onPointerDownOutside={(event) => { if (pending) event.preventDefault() }}
        >
          <DialogHeader>
            <DialogTitle className="font-bold text-destructive">Remove two-factor authentication?</DialogTitle>
            <DialogDescription>Backup codes for this authenticator stop working.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoveOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void remove()} loading={pending}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={codesOpen} onOpenChange={(open) => { if (!pending) setCodesOpen(open) }}>
        <DialogContent
          className="w-[calc(100%-2rem)]"
          onEscapeKeyDown={(event) => { if (pending) event.preventDefault() }}
          onPointerDownOutside={(event) => { if (pending) event.preventDefault() }}
        >
          <DialogHeader>
            <DialogTitle>Save your backup codes</DialogTitle>
            <DialogDescription>These replace the previous codes. Each one works once.</DialogDescription>
          </DialogHeader>
          <ul className="grid grid-cols-2 justify-items-center gap-x-8 gap-y-2 rounded-md border border-border bg-muted px-4 py-3 font-mono text-sm">
            {codes.map((item) => (
              <li key={item} className="text-center tracking-wide">
                {item}
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => void copyCodes()}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button type="button" variant="outline" onClick={downloadCodes}>
              Download
            </Button>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="profile-backup-confirm">Type “I saved my codes”</Label>
            <Input
              id="profile-backup-confirm"
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCodesOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveCodes()} disabled={!confirmed || pending} loading={pending}>
              Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ChangePasswordDialog email={user?.email ?? ''} open={passwordOpen} onOpenChange={setPasswordOpen} />
      <RecoveryKeyDialog open={recoveryOpen} onOpenChange={setRecoveryOpen} />
    </div>
  )
}

function SecurityRow({ title, description, actions }: { title: string; description: string; actions: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border p-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-sm">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
    </div>
  )
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

function RecoveryKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth()
  const passwordRef = useRef('')
  const keyRef = useRef<HTMLParagraphElement>(null)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [replacement, setReplacement] = useState<RecoveryReplacement | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)
  const confirmed = confirmation.trim().toLowerCase() === RECOVERY_CONFIRMATION
  const locked = pending || replacement !== null

  useEffect(() => {
    if (!replacement) return
    keyRef.current?.focus()
  }, [replacement])

  function keepCurrent() {
    passwordRef.current = ''
    setPassword('')
    setShowPassword(false)
    setReplacement(null)
    setConfirmation('')
    setCopied(false)
  }

  function close() {
    keepCurrent()
    onOpenChange(false)
  }

  function requestClose(next: boolean) {
    if (!next && !locked) close()
  }

  async function create(event: FormEvent) {
    event.preventDefault()
    if (pending || password.length === 0 || !user?.id || !user.email) return
    setPending(true)
    const typed = password
    try {
      const created = await prepareRecoveryRotation(user.id, user.email, typed)
      passwordRef.current = typed
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

  async function finish(event: FormEvent) {
    event.preventDefault()
    if (!replacement || !user?.id || !user.email || !confirmed || pending || passwordRef.current.length === 0) return
    setPending(true)
    try {
      await commitRecoveryRotation(user.id, user.email, passwordRef.current, replacement)
      close()
      toast({
        tone: 'success',
        title: 'Recovery key replaced',
        description: 'The previous recovery key no longer opens the encryption key. Your password is unchanged.',
      })
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

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent
        className={cn('max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] overflow-y-auto', replacement && '[&>button]:hidden')}
        onEscapeKeyDown={(event) => { if (locked) event.preventDefault() }}
        onPointerDownOutside={(event) => { if (locked) event.preventDefault() }}
      >
        {replacement ? (
          <form className="grid gap-4" onSubmit={(event) => void finish(event)}>
            <DialogHeader>
              <DialogTitle>Save your new recovery key</DialogTitle>
              <DialogDescription>
                Copy or download it before continuing. This key is not active yet. The current key keeps working until you confirm.
              </DialogDescription>
            </DialogHeader>
            <p
              ref={keyRef}
              id="replacement-recovery-key"
              tabIndex={-1}
              className="break-all rounded-md border border-border bg-muted px-4 py-3 font-mono text-sm tracking-wide outline-none"
            >
              {formatRecoveryKey(replacement.recoveryKey)}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={() => void copyKey()}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button type="button" variant="outline" onClick={downloadKey}>
                Download
              </Button>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="replacement-recovery-confirm">Type “I saved my recovery key”</Label>
              <Input
                id="replacement-recovery-confirm"
                autoComplete="off"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={close}>
                Keep the current key
              </Button>
              <Button type="submit" disabled={!confirmed || pending} loading={pending}>
                Complete
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form className="grid gap-4" onSubmit={(event) => void create(event)}>
            <DialogHeader>
              <DialogTitle>Replace recovery key</DialogTitle>
              <DialogDescription>
                Enter your password to create a replacement. The current key keeps working until you confirm you saved the new one.
              </DialogDescription>
            </DialogHeader>
            <PasswordField
              id="replacement-password"
              label="Current password"
              autoComplete="current-password"
              value={password}
              revealed={showPassword}
              onChange={setPassword}
              onToggle={() => setShowPassword((shown) => !shown)}
            />
            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || password.length === 0} loading={pending}>
                Continue
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ChangePasswordDialog({
  email,
  open,
  onOpenChange,
}: {
  email: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pending, setPending] = useState(false)
  const [nextFocused, setNextFocused] = useState(false)
  const different = passwordDiffersFromCurrent(current, next)
  const canSave = !pending && current.length > 0 && passwordIsStrong(next) && different && next === confirm
  const hasNext = next.length > 0
  const strengthUnmet = PASSWORD_RULES.filter((rule) => !rule.test(next))
  const sameAsCurrent = hasNext && current.length > 0 && next === current
  const requirementGap = strengthUnmet.length > 0 || sameAsCurrent
  const passwordsMatch = hasNext && next === confirm
  const passwordRules = [
    ...PASSWORD_RULES,
    {
      ...DIFFERENT_PASSWORD_RULE,
      test: (value: string) => passwordDiffersFromCurrent(current, value),
    },
  ]

  function clear() {
    setCurrent('')
    setNext('')
    setConfirm('')
    setShowCurrent(false)
    setShowNext(false)
    setShowConfirm(false)
    setNextFocused(false)
  }

  function close() {
    if (pending) return
    clear()
    onOpenChange(false)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!canSave) return
    setPending(true)
    try {
      await changePassword(email, current, next)
      clear()
      onOpenChange(false)
      toast({ tone: 'success', title: 'Password changed.' })
    } catch (error) {
      toast({
        tone: 'error',
        title: "Couldn't change password",
        description: error instanceof Error ? error.message : 'Try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close()
      }}
    >
      <DialogContent
        className="max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto"
        onEscapeKeyDown={(event) => { if (pending) event.preventDefault() }}
        onPointerDownOutside={(event) => { if (pending) event.preventDefault() }}
      >
        <form className="grid gap-4" onSubmit={(event) => void save(event)}>
          <DialogHeader className="pr-6">
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>Enter your current password, then choose a new one.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <PasswordField
              id="profile-current-password"
              label="Current password"
              autoComplete="current-password"
              value={current}
              revealed={showCurrent}
              onChange={setCurrent}
              onToggle={() => setShowCurrent((shown) => !shown)}
            />
            <PasswordField
              id="profile-new-password"
              label="New password"
              autoComplete="new-password"
              value={next}
              revealed={showNext}
              describedBy={
                [nextFocused ? 'profile-password-rules' : '', hasNext && !nextFocused && requirementGap ? 'profile-password-summary' : ''].filter(Boolean).join(' ') ||
                undefined
              }
              onChange={setNext}
              onToggle={() => setShowNext((shown) => !shown)}
              onActiveChange={setNextFocused}
              expanded={nextFocused}
              hint={
                <ul id="profile-password-rules" className="grid gap-1 pt-1">
                  {passwordRules.map((rule) => {
                    const met = rule.test(next)
                    return (
                      <li
                        key={rule.id}
                        className={cn('flex items-center gap-2 text-sm', met ? 'text-foreground' : 'text-muted-foreground')}
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
              }
              statusOpen={hasNext && !nextFocused && requirementGap}
              status={
                <p id="profile-password-summary" className="flex items-center gap-2 pt-1 text-sm text-destructive">
                  <X className="size-4 shrink-0" weight="bold" aria-hidden />
                  {sameAsCurrent && strengthUnmet.length === 0
                    ? 'New password must be different from the current password'
                    : 'Password does not meet the minimum requirements'}
                </p>
              }
            />
            <PasswordField
              id="profile-confirm-password"
              label="Confirm new password"
              autoComplete="new-password"
              value={confirm}
              revealed={showConfirm}
              describedBy={hasNext ? 'profile-confirm-status' : undefined}
              onChange={setConfirm}
              onToggle={() => setShowConfirm((shown) => !shown)}
              expanded={hasNext}
              hint={
                <p
                  id="profile-confirm-status"
                  className={cn(
                    'flex items-center gap-2 pt-1 text-sm',
                    passwordsMatch ? 'text-primary' : 'text-destructive',
                  )}
                >
                  {passwordsMatch ? (
                    <Check className="size-4" weight="bold" aria-hidden />
                  ) : (
                    <X className="size-4" weight="bold" aria-hidden />
                  )}
                  {passwordsMatch ? 'Passwords match' : "Passwords don't match"}
                </p>
              }
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave} loading={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PasswordField({
  id,
  label,
  autoComplete,
  value,
  revealed,
  describedBy,
  hint,
  expanded = false,
  status,
  statusOpen = false,
  onChange,
  onToggle,
  onActiveChange,
}: {
  id: string
  label: string
  autoComplete: string
  value: string
  revealed: boolean
  describedBy?: string
  hint?: ReactNode
  expanded?: boolean
  status?: ReactNode
  statusOpen?: boolean
  onChange: (value: string) => void
  onToggle: () => void
  onActiveChange?: (active: boolean) => void
}) {
  return (
    <div
      className="grid gap-1.5"
      onFocus={() => onActiveChange?.(true)}
      onBlur={(event) => {
        const nextFocus = event.relatedTarget
        if (nextFocus instanceof Node && event.currentTarget.contains(nextFocus)) return
        onActiveChange?.(false)
      }}
    >
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={revealed ? 'text' : 'password'}
          autoComplete={autoComplete}
          aria-describedby={describedBy}
          className="pr-10"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground"
          onClick={onToggle}
          aria-label={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {revealed ? <EyeSlash className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {hint || status ? (
        <div>
          {hint ? <HeightExpand open={expanded}>{hint}</HeightExpand> : null}
          {status ? <HeightExpand open={statusOpen}>{status}</HeightExpand> : null}
        </div>
      ) : null}
    </div>
  )
}

function HeightExpand({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}
    >
      <div className={cn('min-h-0 overflow-hidden', !open && 'pointer-events-none')} aria-hidden={!open}>
        {children}
      </div>
    </div>
  )
}
