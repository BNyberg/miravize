import type { ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router'

import { AuthShell } from '@/components/auth/auth-shell'
import { FaviconSync, SeedSavedTheme } from '@/components/theme-provider'
import { AppShell } from '@/components/layout/app-shell'
import { useTheme } from 'next-themes'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAuth } from '@/features/auth/auth-context'
import { useOnboardingStatus } from '@/features/onboarding/use-onboarding'
import { EncryptionGate } from '@/features/crypto/encryption-gate'
import { RecoveryRotationGate } from '@/features/crypto/recovery-rotation-gate'
import { SessionUnlock } from '@/features/crypto/session-unlock'
import { AdoptSharedKeys } from '@/features/crypto/adopt-shared-keys'
import { ArchiveInvites } from '@/features/crypto/archive-invites'
import { ShareWorkspaceKeys } from '@/features/crypto/share-workspace-key'
import { WorkspaceProvider } from '@/features/workspaces/workspace-context'
import { isSupabaseConfigured } from '@/lib/supabase'
import { ForgotPasswordPage } from '@/pages/forgot-password-page'
import { InvitePage } from '@/pages/invite-page'
import { LoginPage } from '@/pages/login-page'
import { MfaChallengePage } from '@/pages/mfa-challenge-page'
import { MfaSetupPage } from '@/pages/mfa-setup-page'
import { EncryptionSetupPage } from '@/pages/encryption-setup-page'
import { ResetPasswordPage } from '@/pages/reset-password-page'
import { ProjectsPage } from '@/pages/projects-page'
import { RequestsPage } from '@/pages/requests-page'
import { TasksPage } from '@/pages/tasks-page'
import { ProfilePage } from '@/pages/profile-page'
import { SettingsPage } from '@/pages/settings-page'
import { SignupPage } from '@/pages/signup-page'
import { OnboardingPage } from '@/pages/onboarding-page'
import { DisclosureGate } from '@/components/privacy/disclosure-dialog'
import { DISCLOSURES } from '@/features/onboarding/disclosures'
import { TimerPage } from '@/pages/timer-page'
import { ReportPage } from '@/pages/reports-page'

function AppToaster() {
  const { resolvedTheme } = useTheme()
  return <Toaster closeButton position="top-right" theme={resolvedTheme === 'dark' ? 'dark' : 'light'} />
}

function destination(gate: ReturnType<typeof useAuth>['gate'], search: string, complete: boolean) {
  const requested = new URLSearchParams(search).get('next') || '/timer'
  const next = complete ? requested : '/onboarding'
  if (gate === 'challenge') return `/mfa?next=${encodeURIComponent(next)}`
  if (!complete) return '/onboarding'
  if (gate === 'setup' || gate === 'backup') return `/mfa/setup?next=${encodeURIComponent(next)}`
  return next
}

function GuestGate() {
  const { gate } = useAuth()
  const onboarding = useOnboardingStatus()
  const location = useLocation()
  if (gate === 'anon' || gate === 'error') return <Outlet />
  if (onboarding.loading) return <div className="min-h-[32rem]" />
  return <Navigate to={destination(gate, location.search, onboarding.complete)} replace />
}

function MfaGate() {
  const { gate } = useAuth()
  const onboarding = useOnboardingStatus()
  const location = useLocation()
  if (gate === 'anon' || gate === 'error') {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  if (onboarding.loading) return <div className="min-h-[32rem]" />
  if (location.pathname === '/mfa' && gate !== 'challenge') {
    return <Navigate to={destination(gate, location.search, onboarding.complete)} replace />
  }
  if (location.pathname === '/mfa/setup' && gate === 'challenge') {
    return <Navigate to={`/mfa${location.search}`} replace />
  }
  if (!onboarding.complete && location.pathname === '/mfa/setup' && gate !== 'challenge') {
    return <Navigate to="/onboarding" replace />
  }
  return <Outlet />
}

function ReadyGate() {
  const { gate } = useAuth()
  const onboarding = useOnboardingStatus()
  const location = useLocation()
  if (gate === 'anon' || gate === 'error') {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  if (onboarding.loading) return <div className="min-h-[32rem]" />
  if (gate !== 'ready') return <Navigate to={destination(gate, location.search, onboarding.complete)} replace />
  return <Outlet />
}

function OnboardingGate() {
  const { gate } = useAuth()
  const onboarding = useOnboardingStatus()
  if (gate === 'anon' || gate === 'error') return <Navigate to="/signup" replace />
  if (onboarding.loading) return <div className="min-h-[32rem]" />
  if (gate === 'challenge') return <Navigate to="/mfa?next=%2Fonboarding" replace />
  if (onboarding.complete) return <Navigate to="/timer" replace />
  return <Outlet />
}

function Guard({ children }: { children: ReactNode }) {
  const { gate } = useAuth()
  const onboarding = useOnboardingStatus()
  const location = useLocation()
  if (gate === 'anon' || gate === 'error') {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  if (onboarding.loading) return <div className="min-h-svh bg-background" />
  if (gate !== 'ready') {
    const next = encodeURIComponent(onboarding.complete ? `${location.pathname}${location.search}` : '/onboarding')
    const path = gate === 'challenge' ? '/mfa' : onboarding.complete ? '/mfa/setup' : '/onboarding'
    return <Navigate to={`${path}?next=${next}`} replace />
  }
  if (!onboarding.complete) return <Navigate to="/onboarding" replace />
  return (
    <EncryptionGate>
      <RecoveryRotationGate>
        <SessionUnlock>
          <ShareWorkspaceKeys />
          <AdoptSharedKeys />
          <ArchiveInvites />
          <WorkspaceProvider>{children}</WorkspaceProvider>
        </SessionUnlock>
      </RecoveryRotationGate>
    </EncryptionGate>
  )
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
    <AppToaster />
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
        <Route element={<ReadyGate />}>
          <Route path="/encryption-setup" element={<EncryptionSetupPage />} />
        </Route>
        <Route element={<OnboardingGate />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
        </Route>
        <Route path="/invite/:token" element={<InvitePage />} />
      </Route>
      <Route
        element={
          <Guard>
            <AppShell />
          </Guard>
        }
      >
        <Route path="/" element={<Navigate to="/timer" replace />} />
        <Route path="/timer" element={<TimerPage />} />
        <Route path="/reports" element={<DisclosureGate disclosure={DISCLOSURES.reports}><ReportPage /></DisclosureGate>} />
        <Route path="/requests" element={<DisclosureGate disclosure={DISCLOSURES.requests}><RequestsPage /></DisclosureGate>} />
        <Route path="/tasks" element={<DisclosureGate disclosure={DISCLOSURES.tasks}><TasksPage /></DisclosureGate>} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>
    </Routes>
    </TooltipProvider>
  )
}
