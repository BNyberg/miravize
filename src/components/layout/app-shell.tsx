import {
  Clock,
  Folder,
  ListChecks,
  SignOut,
  SquaresFour,
  Table,
  Gear,
  List,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'

import { ThemeToggle } from '@/components/theme-toggle'
import { RunningBanner } from '@/components/layout/running-banner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { useAuth } from '@/features/auth/auth-context'
import { ALL_WORKSPACES, useWorkspace } from '@/features/workspaces/workspace-context'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const nav = [
  { to: '/timer', label: 'Timer', icon: Clock },
  { to: '/timesheet', label: 'Timesheet', icon: Table },
  { to: '/requests', label: 'Requests', icon: ListChecks },
  { to: '/projects', label: 'Projects', icon: Folder },
  { to: '/settings', label: 'Settings', icon: Gear },
]

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { workspaces, workspaceId, setWorkspaceId } = useWorkspace()

  return (
    <>
      <Select value={workspaceId} onValueChange={setWorkspaceId}>
        <SelectTrigger className="mb-4" aria-label="Workspace">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_WORKSPACES}>All workspaces</SelectItem>
          {workspaces.map((ws) => (
            <SelectItem key={ws.id} value={ws.id}>
              {ws.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <nav className="flex flex-col gap-1" aria-label="Main">
        {nav.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors duration-150 hover:bg-muted',
                  isActive && 'bg-muted font-medium text-foreground',
                )
              }
            >
              <Icon aria-hidden="true" className="size-4" />
              {item.label}
            </NavLink>
          )
        })}
      </nav>
    </>
  )
}

export function AppShell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const pathname = useLocation().pathname
  const timerRoute = pathname === '/timer'
  const projectsRoute = pathname === '/projects'
  const fillRoute = timerRoute || projectsRoute
  const [open, setOpen] = useState(false)

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 font-semibold">
          <SquaresFour aria-hidden="true" className="size-5 text-primary" />
          Genki Tenki
        </div>
        <NavItems />
        <div className="mt-auto flex items-center justify-between pt-4">
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          <ThemeToggle />
        </div>
        <Button variant="ghost" className="mt-2 justify-start" onClick={() => void signOut()}>
          <SignOut aria-hidden="true" />
          Sign out
        </Button>
      </aside>
      <div className={cn('flex min-w-0 flex-1 flex-col', fillRoute && 'h-svh min-h-0')}>
        <header className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-border bg-background px-3 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <List aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <div className="mb-6 font-semibold">Genki Tenki</div>
              <NavItems onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="font-semibold">Genki Tenki</span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        {timerRoute ? null : <RunningBanner />}
        <main
          className={
            timerRoute
              ? 'flex min-h-0 flex-1 flex-col'
              : projectsRoute
                ? 'flex min-h-0 flex-1 flex-col p-4 md:p-6'
                : 'flex-1 p-4 md:p-6'
          }
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
