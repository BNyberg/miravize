import {
  Buildings,
  CaretLeft,
  CaretRight,
  ChartBar,
  Clock,
  DotsThree,
  Folder,
  Gear,
  CheckSquare,
  List,
  ListChecks,
  Moon,
  SignOut,
  Sun,
} from '@phosphor-icons/react'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'

import { BrandMark } from '@/components/brand-mark'
import { useSidebarCollapsed } from '@/components/layout/use-sidebar-collapsed'
import { RunningBanner } from '@/components/layout/running-banner'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { useAuth } from '@/features/auth/auth-context'
import { useRunningTimer } from '@/features/timer/use-running-timer'
import { ALL_WORKSPACES, useWorkspace } from '@/features/workspaces/workspace-context'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const nav = [
  { to: '/timer', label: 'Timer', icon: Clock },
  { to: '/reports', label: 'Report', icon: ChartBar },
  { to: '/requests', label: 'Requests', icon: ListChecks },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/projects', label: 'Projects', icon: Folder },
  { to: '/settings', label: 'Settings', icon: Gear },
]

function initialsFromEmail(email: string | undefined) {
  const local = email?.split('@')[0] ?? ''
  const letters = local.replace(/[^a-zA-Z]/g, '')
  if (letters.length >= 2) return letters.slice(0, 2).toUpperCase()
  if (local.length >= 2) return local.slice(0, 2).toUpperCase()
  return (email?.slice(0, 2) ?? '?').toUpperCase()
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { workspaces, workspaceId, setWorkspaceId } = useWorkspace()

  return (
    <>
      <Select value={workspaceId} onValueChange={setWorkspaceId}>
        <SelectTrigger
          className="sidebar-workspace-trigger mb-4 pl-2"
          aria-label="Workspace"
        >
          <Buildings aria-hidden="true" className="size-4 shrink-0" />
          <span className="sidebar-fade min-w-0 flex-1 truncate text-left">
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent className="min-w-56">
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
              title={item.label}
              aria-label={item.label}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'sidebar-nav-link flex h-9 items-center gap-2 rounded-md px-2 text-sm whitespace-nowrap transition-colors duration-150 hover:bg-muted',
                  isActive && 'bg-muted font-medium text-foreground',
                )
              }
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className="sidebar-fade">{item.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </>
  )
}

function UserFooter({
  email,
  onSignOut,
}: {
  email: string | undefined
  onSignOut: () => void
}) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const current = theme === 'system' ? resolvedTheme : theme
  const initials = initialsFromEmail(email)

  return (
    <div className="sidebar-account mt-auto rounded-lg border border-border bg-card p-2 dark:bg-muted">
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
              aria-label="Account menu"
            >
              {initials}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" filter={false}>
            <DropdownMenuItem onSelect={() => setTheme(current === 'dark' ? 'light' : 'dark')}>
              {current === 'dark' ? (
                <Sun aria-hidden="true" className="size-4" />
              ) : (
                <Moon aria-hidden="true" className="size-4" />
              )}
              Toggle theme
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onSignOut}>
              <SignOut aria-hidden="true" className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <p className="sidebar-fade min-w-0 flex-1 truncate text-xs text-muted-foreground">{email}</p>
        <div className="sidebar-fade flex shrink-0 items-center">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More account actions">
                <DotsThree aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" filter={false}>
              <DropdownMenuItem onSelect={onSignOut}>
                <SignOut aria-hidden="true" className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

export function AppShell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const pathname = useLocation().pathname
  const timerRoute = pathname === '/timer'
  const projectsRoute = pathname === '/projects'
  const { data: running } = useRunningTimer()
  const pagePad = running ? 'px-4 pb-4 md:px-6 md:pb-6' : 'p-4 md:p-6' || pathname === '/reports'
  const [open, setOpen] = useState(false)
  const { collapsed, toggle } = useSidebarCollapsed()

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="app-shell min-h-svh bg-background" data-collapsed={collapsed ? 'true' : 'false'}>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <aside className="relative z-30 sticky top-0 hidden h-svh border-r border-sidebar-border bg-sidebar md:block">
        <Button
          variant="ghost"
          size="icon"
          className="sidebar-toggle group absolute top-1/2 right-0 z-20 h-20 w-11 min-h-20 min-w-11 -translate-y-1/2 translate-x-1/2 rounded-md bg-transparent hover:bg-transparent"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={toggle}
        >
          <span className="sidebar-toggle-chip flex h-6 w-6 items-center justify-center rounded-md border border-sidebar-border bg-card group-hover:bg-muted">
            {collapsed ? (
              <CaretRight aria-hidden="true" className="size-3.5" />
            ) : (
              <CaretLeft aria-hidden="true" className="size-3.5" />
            )}
          </span>
        </Button>
        <div className="h-full overflow-hidden">
        <div className="sidebar-panel flex h-full w-full min-w-0 flex-col px-4 pb-4 pt-3">
          <div className="sidebar-brand mb-6 flex h-9 items-center gap-1.5 text-[18px] font-semibold">
            <BrandMark className="size-8" />
            <span className="sidebar-fade truncate">Miravize</span>
          </div>
          <NavItems />
          <UserFooter email={user?.email} onSignOut={() => void signOut()} />
        </div>
        </div>
      </aside>
      <div className="flex h-svh min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-border bg-background px-3 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <List aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <div className="mb-6 flex items-center gap-1.5 text-[18px] font-semibold">
                <BrandMark className="size-8" />
                Miravize
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <NavItems onNavigate={() => setOpen(false)} />
                <UserFooter email={user?.email} onSignOut={() => void signOut()} />
              </div>
            </SheetContent>
          </Sheet>
          <span className="flex items-center gap-1.5 text-[18px] font-semibold">
            <BrandMark className="size-8" />
            Miravize
          </span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <main
          id="main"
          className={
            timerRoute
              ? 'flex min-h-0 flex-1 flex-col'
              : projectsRoute
                ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
                : 'min-h-0 min-w-0 flex-1 overflow-y-auto'
          }
        >
          {timerRoute ? null : <RunningBanner />}
          <div
            className={
              timerRoute
                ? 'contents'
                : projectsRoute
                  ? cn('flex min-h-0 flex-1 flex-col', pagePad)
                  : pagePad
            }
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
