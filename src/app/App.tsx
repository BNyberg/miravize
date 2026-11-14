import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router'

import { AuthShell } from '@/components/auth/auth-shell'
import { SeedSavedTheme } from '@/components/theme-provider'
import { AppShell } from '@/components/layout/app-shell'
import { ToastHost } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAuth } from '@/features/auth/auth-context'
import { WorkspaceProvider } from '@/features/workspaces/workspace-context'
import { isSupabaseConfigured } from '@/lib/supabase'
import { InvitePage } from '@/pages/invite-page'
import { LoginPage } from '@/pages/login-page'
import { ProjectsPage } from '@/pages/projects-page'
import { RequestsPage } from '@/pages/requests-page'
import { TasksPage } from '@/pages/tasks-page'
import { ProfilePage } from '@/pages/profile-page'
import { SettingsPage } from '@/pages/settings-page'
import { SignupPage } from '@/pages/signup-page'
import { TimerPage } from '@/pages/timer-page'
import { ReportPage } from '@/pages/reports-page'

function Guard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>
  if (!user) {
    const next = `${window.location.pathname}${window.location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  return <WorkspaceProvider>{children}</WorkspaceProvider>
}

function Guest({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>
  if (user) {
    const next = new URLSearchParams(window.location.search).get('next') || '/timer'
    return <Navigate to={next} replace />
  }
  return children
}

export function App() {
  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <h1 className="mb-2 text-xl font-semibold">Miravize</h1>
        <p className="text-sm text-muted-foreground">
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in a{' '}
          <code>.env</code> file, then restart the dev server.
        </p>
      </div>
    )
  }

  return (
    <TooltipProvider>
    <SeedSavedTheme />
    <ToastHost />
    <Routes>
      <Route
        element={
          <Guest>
            <AuthShell />
          </Guest>
        }
      >
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
      </Route>
      <Route
        path="/invite/:token"
        element={
          <Guard>
            <InvitePage />
          </Guard>
        }
      />
      <Route
        element={
          <Guard>
            <AppShell />
          </Guard>
        }
      >
        <Route path="/" element={<Navigate to="/timer" replace />} />
        <Route path="/timer" element={<TimerPage />} />
        <Route path="/reports" element={<ReportPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>
    </Routes>
    </TooltipProvider>
  )
}
