import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'

import { AuthSweepCopy } from '@/components/auth/auth-sweep-copy'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase'

type InvitePreview = {
  email: string
  workspace_label: string
  expired: boolean
  accepted: boolean
}

export function InvitePage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { gate, loading } = useAuth()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [missing, setMissing] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [pending, setPending] = useState(false)
  const next = `/invite/${token ?? ''}`

  useEffect(() => {
    if (!token) return
    let cancelled = false
    void supabase
      .rpc('preview_workspace_invite', { p_token: token })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setPreview(null)
          setMissing(true)
          toast.error("Couldn't open this invite", { description: error.message })
          return
        }
        const row = (Array.isArray(data) ? data[0] : data) as InvitePreview | undefined
        if (!row) {
          setPreview(null)
          setMissing(true)
          return
        }
        setMissing(false)
        setPreview(row)
      })
    return () => {
      cancelled = true
    }
  }, [attempt, token])

  async function accept() {
    if (pending || !token) return
    setPending(true)
    const { error } = await supabase.rpc('accept_workspace_invite', { p_token: token })
    setPending(false)
    if (error) {
      toast.error("Couldn't join the workspace", { description: error.message })
      return
    }
    navigate('/timer')
  }

  const inviteMissing = !token || missing
  if (loading || (!preview && !inviteMissing)) return <p className="text-sm text-[#5e5c57]">Loading…</p>

  if (gate === 'challenge' || gate === 'setup' || gate === 'backup') {
    const path = gate === 'challenge' ? '/mfa' : '/mfa/setup'
    return <Navigate to={`${path}?next=${encodeURIComponent(next)}`} replace />
  }

  const label = preview?.workspace_label || 'a workspace'

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div className="flex flex-col items-center gap-3">
        <BrandMark onLight className="size-16" />
        <div className="grid gap-1">
          <AuthSweepCopy as="h1" className="text-2xl font-medium tracking-tight">
            {inviteMissing ? 'Invite not found' : preview?.expired ? 'Invite expired' : "You've been invited"}
          </AuthSweepCopy>
          {preview && !preview.expired ? (
            <AuthSweepCopy delay className="text-sm text-[#5e5c57]">
              Join {label} on Miravize. Sign in as {preview.email}.
            </AuthSweepCopy>
          ) : (
            <AuthSweepCopy delay className="text-sm text-[#5e5c57]">
              {inviteMissing ? 'Ask for a new invite link.' : 'Ask the workspace owner to send a new one.'}
            </AuthSweepCopy>
          )}
        </div>
      </div>
      {inviteMissing ? (
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full"
          onClick={() => {
            setMissing(false)
            setPreview(null)
            setAttempt((value) => value + 1)
          }}
        >
          Try again
        </Button>
      ) : null}
      {preview && !preview.expired && !preview.accepted && gate === 'anon' ? (
        <div className="grid w-full gap-2">
          <Button asChild className="h-10">
            <Link to={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
          </Button>
          <Button asChild variant="outline" className="h-10">
            <Link to={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link>
          </Button>
        </div>
      ) : null}
      {preview && !preview.expired && !preview.accepted && gate === 'ready' ? (
        <Button type="button" className="h-10 w-full" disabled={pending} loading={pending} onClick={() => void accept()}>
          {`Join ${label}`}
        </Button>
      ) : null}
      {preview?.accepted && gate === 'ready' ? (
        <Button type="button" className="h-10 w-full" onClick={() => navigate('/timer')}>
          Open Miravize
        </Button>
      ) : null}
      {preview?.accepted && gate === 'anon' ? (
        <Button asChild className="h-10 w-full">
          <Link to={`/login?next=${encodeURIComponent('/timer')}`}>Sign in</Link>
        </Button>
      ) : null}
    </div>
  )
}
