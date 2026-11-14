import { BanknotesIcon, BuildingOffice2Icon, ClockIcon, InboxIcon, ListBulletIcon } from '@heroicons/react/24/outline'
import { Desktop, Moon, Sun } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import { AccountAvatar } from '@/components/account/account-avatar'
import { avatarUrlFromUser } from '@/lib/avatar-image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { ZOOM_STEPS } from '@/components/timer/week-layout'
import { useAuth } from '@/features/auth/auth-context'
import { useWorkspace } from '@/features/workspaces/workspace-context'
import { useDebouncedPreferences } from '@/lib/use-debounced-preferences'
import {
  CURRENCIES,
  CURRENCY_SYMBOL,
  TIMER_SPANS,
  type AppTheme,
  type CurrencyCode,
} from '@/lib/user-preferences'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

function savedName(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') return ''
  const name = (metadata as { full_name?: unknown }).full_name
  return typeof name === 'string' ? name : ''
}

export function ProfilePage() {
  const { user } = useAuth()
  const { memberships } = useWorkspace()
  const { setTheme } = useTheme()
  const { preferences: prefs, schedule } = useDebouncedPreferences()
  const accountName = savedName(user?.user_metadata)
  const accountEmail = user?.email ?? ''
  const [name, setName] = useState(accountName)
  const [savingAccount, setSavingAccount] = useState(false)

  useEffect(() => {
    setName(accountName)
  }, [accountName, user?.id])

  const accountDirty = name.trim() !== accountName.trim()

  const stats = useQuery({
    queryKey: ['profile-stats', user?.id, prefs.currency],
    enabled: Boolean(user),
    queryFn: async () => {
      const [entries, requests, tasks] = await Promise.all([
        supabase.from('time_entries').select('duration_seconds, billable, project:projects(currency, hourly_rate)'),
        supabase.from('requests').select('id', { count: 'exact', head: true }),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'done'),
      ])
      if (entries.error) throw entries.error
      if (requests.error) throw requests.error
      if (tasks.error) throw tasks.error
      let seconds = 0
      let money = 0
      for (const row of entries.data ?? []) {
        const duration = row.duration_seconds ?? 0
        seconds += duration
        const project = row.project as { currency?: string; hourly_rate?: number | null } | null
        if (!row.billable || project?.currency !== prefs.currency || project.hourly_rate == null) continue
        money += (duration / 3600) * Number(project.hourly_rate)
      }
      return {
        seconds,
        money,
        requests: requests.count ?? 0,
        tasks: tasks.count ?? 0,
      }
    },
  })

  async function saveAccount() {
    if (!accountDirty || savingAccount) return
    setSavingAccount(true)
    const { error } = await supabase.auth.updateUser({
      data: { full_name: name.trim() },
    })
    setSavingAccount(false)
    if (error) {
      toast({ tone: 'error', title: "Couldn't save account", description: error.message })
      return
    }
    setName(name.trim())
  }

  const hours = Math.round((stats.data?.seconds ?? 0) / 3600)
  const money = Math.round(stats.data?.money ?? 0)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Profile</h1>
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex gap-4">
          <AccountAvatar email={accountEmail} avatarUrl={avatarUrlFromUser(user?.user_metadata)} size="lg" />
          <div className="grid h-20 min-w-0 flex-1 grid-rows-2 gap-2">
            <Input aria-label="Name" className="h-full" value={name} onChange={(event) => setName(event.target.value)} />
            <div className="h-full cursor-not-allowed">
              <Input
                aria-label="Email"
                type="email"
                readOnly
                tabIndex={-1}
                className="pointer-events-none h-full text-muted-foreground"
                value={accountEmail}
              />
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-4">
        <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <BuildingOffice2Icon className="size-4" aria-hidden="true" />
            {memberships.length} Workspaces
          </span>
          <span aria-hidden="true">|</span>
          <span className="inline-flex items-center gap-1.5">
            <ClockIcon className="size-4" aria-hidden="true" />
            {hours} hours
          </span>
          <span aria-hidden="true">|</span>
          <span className="inline-flex items-center gap-1.5">
            <BanknotesIcon className="size-4" aria-hidden="true" />
            {money} {prefs.currency}
          </span>
          <span aria-hidden="true">|</span>
          <span className="inline-flex items-center gap-1.5">
            <InboxIcon className="size-4" aria-hidden="true" />
            {stats.data?.requests ?? 0} Requests
          </span>
          <span aria-hidden="true">|</span>
          <span className="inline-flex items-center gap-1.5">
            <ListBulletIcon className="size-4" aria-hidden="true" />
            {stats.data?.tasks ?? 0} completed tasks
          </span>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9"
            disabled={!accountDirty || savingAccount}
            onClick={() => setName(accountName)}
          >
            Cancel
          </Button>
          <Button type="button" className="h-9" disabled={!accountDirty} loading={savingAccount} onClick={() => void saveAccount()}>
            Save
          </Button>
        </div>
        </div>
      </section>

      <div>
        <p className="mb-2 text-sm font-medium">Preferences</p>
        <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
          <div>
            <Label>App theme</Label>
            <div className="mt-2 flex h-9 w-fit overflow-hidden rounded-md border border-border">
              {(
                [
                  ['light', 'Light', Sun],
                  ['dark', 'Dark', Moon],
                  ['system', 'System', Desktop],
                ] as const
              ).map(([value, text, Icon]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={prefs.theme === value}
                  className={cn(
                    'inline-flex h-full items-center gap-1.5 px-3 text-sm',
                    prefs.theme === value ? 'bg-foreground text-background' : 'text-muted-foreground',
                  )}
                  onClick={() => {
                    setTheme(value)
                    schedule({ theme: value as AppTheme })
                  }}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {text}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="profile-currency">Your currency</Label>
            <Select
              value={prefs.currency}
              onValueChange={(value) => schedule({ currency: value as CurrencyCode })}
            >
              <SelectTrigger id="profile-currency" className="mt-2 h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code} · {CURRENCY_SYMBOL[code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Default grid view</Label>
            <div className="mt-2 flex h-9 w-fit overflow-hidden rounded-md border border-border">
              {TIMER_SPANS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={prefs.timer_span === value}
                  className={cn(
                    'h-full px-3 text-sm',
                    prefs.timer_span === value ? 'bg-foreground text-background' : 'text-muted-foreground',
                  )}
                  onClick={() => schedule({ timer_span: value })}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="profile-zoom">Default zoom level</Label>
            <Select
              value={String(prefs.timer_zoom)}
              onValueChange={(value) => schedule({ timer_zoom: Number(value) })}
            >
              <SelectTrigger id="profile-zoom" className="mt-2 h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZOOM_STEPS.map((step) => (
                  <SelectItem key={step} value={String(step)}>
                    {Math.round(step * 100)}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>
      </div>
    </div>
  )
}
