import { Eye, EyeSlash } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { useSyncExternalStore, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/auth-context'
import { useWorkspace } from '@/features/workspaces/workspace-context'
import { readMode, subscribeReadMode } from '@/features/crypto/field-mirror'
import {
  envelopePresence,
  envelopePresenceSnapshot,
  peekSessionPrivateKey,
  subscribeEnvelopePresence,
} from '@/features/crypto/session-private-key'
import { forgetDualWorkspaces } from '@/features/crypto/read-copy'
import { unlockWorkspace, unlockWorkspacesWithRecovery } from '@/features/crypto/personal-backfill'
import { rotateWorkspaceKey } from '@/features/crypto/rotate-workspace-key'
import type { Workspace } from '@/types'

export function LockedWorkspaceGate({ children }: { children: React.ReactNode }) {
  const { workspaces, workspaceId, isAll, loading } = useWorkspace()
  const signature = useSyncExternalStore(subscribeReadMode, () =>
    workspaces
      .map((workspace) => `${workspace.id}:${readMode(workspace.id)}`)
      .join('|'),
  )
  const envelopes = useSyncExternalStore(subscribeEnvelopePresence, envelopePresenceSnapshot)
  void signature
  void envelopes
  const seen = new Set<string>()
  const locked = workspaces.filter((workspace) => {
    if (seen.has(workspace.id)) return false
    seen.add(workspace.id)
    if (workspace.encryption_status !== 'ciphertext_only') return false
    if (!isAll && workspace.id !== workspaceId) return false
    if (readMode(workspace.id) !== 'original') return false
    return envelopePresence(workspace.id) === 'present' && peekSessionPrivateKey() == null
  })
  if (loading) return <div className="min-h-40" />
  if (locked.length > 0) return <UnlockPanel workspaces={locked} />
  return children
}

function UnlockPanel({ workspaces }: { workspaces: Workspace[] }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [recoveryKey, setRecoveryKey] = useState('')
  const [pending, setPending] = useState(false)

  async function refresh() {
    forgetDualWorkspaces()
    await queryClient.invalidateQueries()
  }

  async function unlockWithPassword(event: FormEvent) {
    event.preventDefault()
    if (pending || password.length === 0 || !user?.email) return
    setPending(true)
    try {
      for (const workspace of workspaces) {
        await unlockWorkspace(user.email, password, workspace.id_code)
      }
      setPassword('')
      await refresh()
      toast.success('Workspace unlocked', { description: 'The names are read from the encrypted copy.' })
    } catch (error) {
      toast.error("Couldn't unlock the workspace", { description: error instanceof Error ? error.message : 'Try again.' })
    } finally {
      setPending(false)
    }
  }

  async function unlockWithRecovery(event: FormEvent) {
    event.preventDefault()
    if (pending || recoveryKey.trim().length === 0) return
    setPending(true)
    try {
      await unlockWorkspacesWithRecovery(recoveryKey)
      setRecoveryKey('')
      await refresh()
      toast.success('Recovery key unlocked the workspaces', { description: 'The names are read from the encrypted copy.' })
    } catch (error) {
      toast.error("Couldn't unlock with the recovery key", { description: error instanceof Error ? error.message : 'Try again.' })
    } finally {
      setPending(false)
    }
  }

  const rotating = workspaces.filter((workspace) => workspace.key_rotation_status === 'rotating')
  const label = workspaces.map((workspace) => workspace.name || workspace.id_code).join(', ')

  async function finishRotation() {
    if (pending || password.length === 0 || !user?.email || rotating.length === 0) return
    setPending(true)
    try {
      for (const workspace of rotating) {
        await rotateWorkspaceKey(user.email, password, workspace.id)
      }
      setPassword('')
      await refresh()
      toast.success('Encryption key rotated', { description: 'The names are read from the new encrypted copy.' })
    } catch (error) {
      toast.error("Couldn't finish the key rotation", { description: error instanceof Error ? error.message : 'Try again.' })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid max-w-lg gap-4">
      <section className="grid gap-3 rounded-lg border border-border bg-card p-4">
        <h1 className="sr-only">Unlock workspace</h1>
        <p className="text-sm text-muted-foreground">
          {label} is encrypted. Enter the current password or the recovery key to see its names. This is not a two-factor code.
        </p>
        <form className="grid gap-2" onSubmit={(event) => void unlockWithPassword(event)}>
          <Label htmlFor="locked-workspace-password">Current password</Label>
          <div className="relative">
            <Input
              id="locked-workspace-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="pr-10"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground"
              onClick={() => setShowPassword((open) => !open)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeSlash className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <Button type="submit" disabled={pending || password.length === 0 || !user?.email} loading={pending}>
            Unlock
          </Button>
          {rotating.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending || password.length === 0 || !user?.email}
              loading={pending}
              onClick={() => void finishRotation()}
            >
              Finish key rotation
            </Button>
          ) : null}
        </form>
        <form className="grid gap-2" onSubmit={(event) => void unlockWithRecovery(event)}>
          <Label htmlFor="locked-workspace-recovery">Recovery key</Label>
          <Textarea
            id="locked-workspace-recovery"
            autoComplete="off"
            value={recoveryKey}
            onChange={(event) => setRecoveryKey(event.target.value)}
          />
          <Button type="submit" variant="outline" disabled={pending || recoveryKey.trim().length === 0} loading={pending}>
            Unlock with recovery key
          </Button>
        </form>
      </section>
    </div>
  )
}
