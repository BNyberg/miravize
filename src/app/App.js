import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { AuthShell } from '@/components/auth/auth-shell';
import { FaviconSync, SeedSavedTheme } from '@/components/theme-provider';
import { AppShell } from '@/components/layout/app-shell';
import { ToastHost } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuth } from '@/features/auth/auth-context';
import { WorkspaceProvider } from '@/features/workspaces/workspace-context';
import { isSupabaseConfigured } from '@/lib/supabase';
import { ForgotPasswordPage } from '@/pages/forgot-password-page';
import { InvitePage } from '@/pages/invite-page';
import { LoginPage } from '@/pages/login-page';
import { MfaChallengePage } from '@/pages/mfa-challenge-page';
import { MfaSetupPage } from '@/pages/mfa-setup-page';
import { ResetPasswordPage } from '@/pages/reset-password-page';
import { ProjectsPage } from '@/pages/projects-page';
import { RequestsPage } from '@/pages/requests-page';
import { TasksPage } from '@/pages/tasks-page';
import { ProfilePage } from '@/pages/profile-page';
import { SettingsPage } from '@/pages/settings-page';
import { SignupPage } from '@/pages/signup-page';
import { TimerPage } from '@/pages/timer-page';
import { ReportPage } from '@/pages/reports-page';
function destination(gate, search) {
    const next = new URLSearchParams(search).get('next') || '/timer';
    if (gate === 'challenge')
        return `/mfa?next=${encodeURIComponent(next)}`;
    if (gate === 'setup' || gate === 'backup')
        return `/mfa/setup?next=${encodeURIComponent(next)}`;
    return next;
}
function GuestGate() {
    const { gate } = useAuth();
    const location = useLocation();
    if (gate === 'anon' || gate === 'error')
        return _jsx(Outlet, {});
    return _jsx(Navigate, { to: destination(gate, location.search), replace: true });
}
function MfaGate() {
    const { gate } = useAuth();
    const location = useLocation();
    if (gate === 'anon' || gate === 'error') {
        const next = `${location.pathname}${location.search}`;
        return _jsx(Navigate, { to: `/login?next=${encodeURIComponent(next)}`, replace: true });
    }
    if (location.pathname === '/mfa' && gate !== 'challenge') {
        return _jsx(Navigate, { to: destination(gate, location.search), replace: true });
    }
    if (location.pathname === '/mfa/setup' && gate === 'challenge') {
        return _jsx(Navigate, { to: `/mfa${location.search}`, replace: true });
    }
    return _jsx(Outlet, {});
}
function Guard({ children }) {
    const { gate } = useAuth();
    const location = useLocation();
    if (gate === 'anon' || gate === 'error') {
        const next = `${location.pathname}${location.search}`;
        return _jsx(Navigate, { to: `/login?next=${encodeURIComponent(next)}`, replace: true });
    }
    if (gate !== 'ready') {
        const next = encodeURIComponent(`${location.pathname}${location.search}`);
        const path = gate === 'challenge' ? '/mfa' : '/mfa/setup';
        return _jsx(Navigate, { to: `${path}?next=${next}`, replace: true });
    }
    return _jsx(WorkspaceProvider, { children: children });
}
export function App() {
    const { loading, gate, assuranceError, refreshAssurance } = useAuth();
    if (!isSupabaseConfigured) {
        return (_jsxs("div", { className: "mx-auto max-w-lg p-8", children: [_jsx("h1", { className: "mb-2 text-xl font-semibold", children: "Miravize" }), _jsxs("p", { className: "text-sm text-muted-foreground", children: ["Set ", _jsx("code", { children: "VITE_SUPABASE_URL" }), " and ", _jsx("code", { children: "VITE_SUPABASE_PUBLISHABLE_KEY" }), " in a", ' ', _jsx("code", { children: ".env" }), " file, then restart the dev server."] })] }));
    }
    if (loading)
        return _jsx("div", { className: "min-h-svh bg-background" });
    if (gate === 'error') {
        return (_jsxs("div", { className: "mx-auto flex min-h-svh max-w-md flex-col justify-center gap-3 p-8", children: [_jsx("p", { className: "text-sm text-muted-foreground", children: assuranceError ?? "Couldn't check two-factor authentication." }), _jsx("button", { type: "button", className: "text-sm font-medium underline-offset-4 hover:underline", onClick: () => void refreshAssurance(), children: "Try again" })] }));
    }
    return (_jsxs(TooltipProvider, { children: [_jsx(FaviconSync, {}), _jsx(SeedSavedTheme, {}), _jsx(ToastHost, {}), _jsxs(Routes, { children: [_jsxs(Route, { element: _jsx(AuthShell, {}), children: [_jsx(Route, { path: "/reset-password", element: _jsx(ResetPasswordPage, {}) }), _jsxs(Route, { element: _jsx(GuestGate, {}), children: [_jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsx(Route, { path: "/signup", element: _jsx(SignupPage, {}) }), _jsx(Route, { path: "/forgot-password", element: _jsx(ForgotPasswordPage, {}) })] }), _jsxs(Route, { element: _jsx(MfaGate, {}), children: [_jsx(Route, { path: "/mfa", element: _jsx(MfaChallengePage, {}) }), _jsx(Route, { path: "/mfa/setup", element: _jsx(MfaSetupPage, {}) })] })] }), _jsx(Route, { path: "/invite/:token", element: _jsx(Guard, { children: _jsx(InvitePage, {}) }) }), _jsxs(Route, { element: _jsx(Guard, { children: _jsx(AppShell, {}) }), children: [_jsx(Route, { path: "/", element: _jsx(Navigate, { to: "/timer", replace: true }) }), _jsx(Route, { path: "/timer", element: _jsx(TimerPage, {}) }), _jsx(Route, { path: "/reports", element: _jsx(ReportPage, {}) }), _jsx(Route, { path: "/requests", element: _jsx(RequestsPage, {}) }), _jsx(Route, { path: "/tasks", element: _jsx(TasksPage, {}) }), _jsx(Route, { path: "/projects", element: _jsx(ProjectsPage, {}) }), _jsx(Route, { path: "/settings", element: _jsx(SettingsPage, {}) }), _jsx(Route, { path: "/profile", element: _jsx(ProfilePage, {}) })] })] })] }));
}
