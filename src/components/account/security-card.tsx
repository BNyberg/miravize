import { useState } from 'react'
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
import { useAuth } from '@/features/auth/auth-context'
import {
  BACKUP_CONFIRMATION,
  backupCodesText,
  createBackupCodes,
  clearAuthenticatorEnroll,
  deleteBackupCodes,
  metadataString,
  replaceBackupCodes,
} from '@/features/auth/mfa'
import { supabase } from '@/lib/supabase'

export function SecurityCard() {
  const { user, assurance, refreshAssurance } = useAuth()
  const navigate = useNavigate()
  const enrolled = assurance.currentLevel === 'aal2' || assurance.nextLevel === 'aal2'
  const deviceName = metadataString(user?.user_metadata, 'mfa_device_name') || 'Authenticator'
  const [removeOpen, setRemoveOpen] = useState(false)
  const [codesOpen, setCodesOpen] = useState(false)
  const [codes, setCodes] = useState<string[]>([])
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)
  const confirmed = confirmation.trim().toLowerCase() === BACKUP_CONFIRMATION

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
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm">Two-factor authentication</p>
            <p className="text-sm text-muted-foreground">
              {enrolled ? deviceName : 'Add an authenticator app to protect this account.'}
            </p>
          </div>
          {enrolled ? (
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" onClick={openCodes}>
                New backup codes
              </Button>
              <Button type="button" variant="outline" onClick={() => setRemoveOpen(true)}>
                Remove 2FA
              </Button>
            </div>
          ) : (
            <Button type="button" onClick={() => navigate('/mfa/setup?return=profile')}>
              Set up 2FA
            </Button>
          )}
        </div>
      </section>

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
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

      <Dialog open={codesOpen} onOpenChange={setCodesOpen}>
        <DialogContent>
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
    </div>
  )
}
