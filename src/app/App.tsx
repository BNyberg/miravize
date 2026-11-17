import type { ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router'

import { AuthShell } from '@/components/auth/auth-shell'
import { FaviconSync, SeedSavedTheme } from '@/components/theme-provider'
import { AppShell } from '@/components/layout/app-shell'
import { ToastHost } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAuth } from '@/features/auth/auth-context'
import { WorkspaceProvider } from '@/features/workspaces/workspace-context'
import { isSupabaseConfigured } from '@/lib/supabase'
import { ForgotPasswordPage } from '@/pages/forgot-password-page'
import { InvitePage } from '@/pages/invite-page'
import { LoginPage } from '@/pages/login-page'
import { MfaChallengePage } from '@/pages/mfa-challenge-page'
import { MfaSetupPage } from '@/pages/mfa-setup-page'
import { ResetPasswordPage } from '@/pages/reset-password-page'
import { ProjectsPage } from '@/pages/projects-page'
import { RequestsPage } from '@/pages/requests-page'
import { TasksPage } from '@/pages/tasks-page'
import { ProfilePage } from '@/pages/profile-page'
import { SettingsPage } from '@/pages/settings-page'
import { SignupPage } from '@/pages/signup-page'
import { TimerPage } from '@/pages/timer-page'
import { ReportPage } from '@/pages/reports-page'

function destination(gate: ReturnType<typeof useAuth>['gate'], search: string) {
  const next = new URLSearchParams(search).get('next') || '/timer'
  if (gate === 'challenge') return `/mfa?next=${encodeURIComponent(next)}`
  if (gate === 'setup' || gate === 'backup') return `/mfa/setup?next=${encodeURIComponent(next)}`
  return next
}

function GuestGate() {
  const { gate } = useAuth()
  const location = useLocation()
  if (gate === 'anon' || gate === 'error') return <Outlet />
  return <Navigate to={destination(gate, location.search)} replace />
}

function MfaGate() {
  const { gate } = useAuth()
  const location = useLocation()
  if (gate === 'anon' || gate === 'error') {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  if (location.pathname === '/mfa' && gate !== 'challenge') {
    return <Navigate to={destination(gate, location.search)} replace />
  }
  if (location.pathname === '/mfa/setup' && gate === 'challenge') {
    return <Navigate to={`/mfa${location.search}`} replace />
  }
  return <Outlet />
}

function Guard({ children }: { children: ReactNode }) {
  const { gate } = useAuth()
  const location = useLocation()
  if (gate === 'anon' || gate === 'error') {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  if (gate !== 'ready') {
    const next = encodeURIComponent(`${location.pathname}${location.search}`)
    const path = gate === 'challenge' ? '/mfa' : '/mfa/setup'
    return <Navigate to={`${path}?next=${next}`} replace />
  }
  return <WorkspaceProvider>{children}</WorkspaceProvider>
}

export function App() {
  const { loading, gate, assuranceError, refreshAssurance } = useAuth()
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

  if (loading) return <div className="min-h-svh bg-background" />

  if (gate === 'error') {
    return (
      <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-3 p-8">
        <p className="text-sm text-muted-foreground">{assuranceError ?? "Couldn't check two-factor authentication."}</p>
        <button type="button" className="text-sm font-medium underline-offset-4 hover:underline" onClick={() => void refreshAssurance()}>
          Try again
        </button>
      </div>
    )
  }

  return (
    <TooltipProvider>
    <FaviconSync />
    <SeedSavedTheme />
    <ToastHost />
    <Routes>
      <Route element={<AuthShell />}>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<GuestGate />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>
        <Route element={<MfaGate />}>
          <Route path="/mfa" element={<MfaChallengePage />} />
          <Route path="/mfa/setup" element={<MfaSetupPage />} />
        </Route>
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
