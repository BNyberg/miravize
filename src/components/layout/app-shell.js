import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Buildings, CaretLeft, CaretRight, ChartBar, Clock, DotsThree, Folder, Gear, List, Moon, SignOut, Sun, User, } from '@phosphor-icons/react';
import { InboxIcon, ListBulletIcon } from '@heroicons/react/24/outline';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { AccountPhoto } from '@/components/account/account-avatar';
import { avatarUrlFromUser } from '@/lib/avatar-image';
import { BrandMark } from '@/components/brand-mark';
import { WorkspaceMark } from '@/components/workspaces/workspace-icon';
import { useSidebarCollapsed } from '@/components/layout/use-sidebar-collapsed';
import { RunningBanner } from '@/components/layout/running-banner';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/features/auth/auth-context';
import { removeUnverifiedTotp } from '@/features/auth/mfa';
import { ALL_WORKSPACES, useWorkspace } from '@/features/workspaces/workspace-context';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
const nav = [
    { to: '/timer', label: 'Timer', icon: Clock },
    { to: '/reports', label: 'Report', icon: ChartBar },
    { to: '/requests', label: 'Requests', icon: InboxIcon },
    { to: '/tasks', label: 'Tasks', icon: ListBulletIcon },
    { to: '/projects', label: 'Projects', icon: Folder },
    { to: '/settings', label: 'Settings', icon: Gear },
];
function NavItems({ onNavigate }) {
    const { workspaces, workspaceId, isAll, setWorkspaceId } = useWorkspace();
    const active = workspaces.find((workspace) => workspace.id === workspaceId);
    return (_jsxs(_Fragment, { children: [_jsxs(Select, { value: workspaceId, onValueChange: setWorkspaceId, children: [_jsxs(SelectTrigger, { className: "sidebar-workspace-trigger mb-4", "aria-label": "Workspace", children: [_jsx("span", { className: "sidebar-icon", children: isAll || !active ? (_jsx(Buildings, { "aria-hidden": "true", className: "size-4 shrink-0" })) : (_jsx(WorkspaceMark, { icon: active.icon })) }), _jsx("span", { className: "sidebar-fade truncate text-left", children: _jsx(SelectValue, {}) })] }), _jsxs(SelectContent, { className: "min-w-56", children: [_jsx(SelectItem, { value: ALL_WORKSPACES, leading: _jsx(Buildings, { "aria-hidden": "true", className: "size-4" }), children: "All workspaces" }), workspaces.map((ws) => (_jsx(SelectItem, { value: ws.id, leading: _jsx(WorkspaceMark, { icon: ws.icon }), children: ws.name }, ws.id)))] })] }), _jsx("nav", { className: "flex flex-col gap-1", "aria-label": "Main", children: nav.map((item) => {
                    const Icon = item.icon;
                    return (_jsxs(NavLink, { to: item.to, title: item.label, "aria-label": item.label, onClick: onNavigate, className: ({ isActive }) => cn('sidebar-nav-link flex h-9 items-center rounded-md text-sm whitespace-nowrap hover:bg-muted', isActive && 'bg-muted font-medium text-foreground'), children: [_jsx("span", { className: "sidebar-icon", children: _jsx(Icon, { "aria-hidden": "true", className: "size-4 shrink-0" }) }), _jsx("span", { className: "sidebar-fade", children: item.label })] }, item.to));
                }) })] }));
}
function AccountMenuItems({ onSignOut, onNavigate, }) {
    const navigate = useNavigate();
    const { theme, setTheme, resolvedTheme } = useTheme();
    const current = theme === 'system' ? resolvedTheme : theme;
    return (_jsxs(_Fragment, { children: [_jsxs(DropdownMenuItem, { onSelect: () => {
                    onNavigate?.();
                    navigate('/profile');
                }, children: [_jsx(User, { "aria-hidden": "true", className: "size-4" }), "Profile"] }), _jsxs(DropdownMenuItem, { onSelect: () => setTheme(current === 'dark' ? 'light' : 'dark'), children: [current === 'dark' ? (_jsx(Sun, { "aria-hidden": "true", className: "size-4" })) : (_jsx(Moon, { "aria-hidden": "true", className: "size-4" })), "Toggle theme"] }), _jsxs(DropdownMenuItem, { onSelect: onSignOut, children: [_jsx(SignOut, { "aria-hidden": "true", className: "size-4" }), "Sign out"] })] }));
}
function UserFooter({ email, name, avatarUrl, onSignOut, onNavigate, }) {
    const label = name?.trim() || email;
    return (_jsxs("div", { className: "sidebar-account mt-auto flex items-stretch overflow-hidden rounded-lg border border-border bg-card dark:bg-muted", children: [_jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsx("button", { type: "button", className: "sidebar-account-photo flex shrink-0 items-center justify-center overflow-hidden bg-muted", "aria-label": "Account menu", children: _jsx(AccountPhoto, { email: email, avatarUrl: avatarUrl }) }) }), _jsx(DropdownMenuContent, { align: "start", side: "top", filter: false, children: _jsx(AccountMenuItems, { onSignOut: onSignOut, onNavigate: onNavigate }) })] }), _jsxs("div", { className: "sidebar-fade min-w-0 gap-1", children: [_jsx("p", { className: "min-w-0 flex-1 truncate text-xs text-muted-foreground", children: label }), _jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsx("button", { type: "button", className: "flex size-8 shrink-0 items-center justify-center rounded-md", "aria-label": "Account menu", children: _jsx(DotsThree, { "aria-hidden": "true", className: "size-4" }) }) }), _jsx(DropdownMenuContent, { align: "end", side: "top", filter: false, children: _jsx(AccountMenuItems, { onSignOut: onSignOut, onNavigate: onNavigate }) })] })] })] }));
}
export function AppShell() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const pathname = useLocation().pathname;
    const timerRoute = pathname === '/timer';
    const fillRoute = pathname === '/projects' ||
        pathname === '/requests' ||
        pathname === '/tasks' ||
        pathname === '/settings' ||
        pathname === '/reports';
    const [bannerSpace, setBannerSpace] = useState(false);
    const pagePad = bannerSpace ? 'px-4 pb-4 md:px-6 md:pb-6' : 'p-4 md:p-6';
    const [open, setOpen] = useState(false);
    const { collapsed, toggle } = useSidebarCollapsed();
    useEffect(() => {
        void removeUnverifiedTotp().catch(() => {
            // Leftover unverified factors are cleaned up the next time the app opens.
        });
    }, []);
    async function signOut() {
        await supabase.auth.signOut();
        navigate('/login');
    }
    return (_jsxs("div", { className: "app-shell min-h-svh bg-background", "data-collapsed": collapsed ? 'true' : 'false', children: [_jsx("a", { href: "#main", className: "skip-link", children: "Skip to main content" }), _jsxs("aside", { className: "relative z-30 sticky top-0 hidden h-svh border-r border-sidebar-border bg-sidebar md:block", children: [_jsx(Button, { variant: "ghost", size: "icon", className: "sidebar-toggle group absolute top-1/2 right-0 z-20 h-20 w-11 min-h-20 min-w-11 -translate-y-1/2 translate-x-1/2 rounded-md bg-transparent hover:bg-transparent", "aria-expanded": !collapsed, "aria-label": collapsed ? 'Expand sidebar' : 'Collapse sidebar', onClick: toggle, children: _jsx("span", { className: "sidebar-toggle-chip flex h-6 w-6 items-center justify-center rounded-md border border-sidebar-border bg-card group-hover:bg-muted", children: collapsed ? (_jsx(CaretRight, { "aria-hidden": "true", className: "size-3.5" })) : (_jsx(CaretLeft, { "aria-hidden": "true", className: "size-3.5" })) }) }), _jsx("div", { className: "h-full overflow-hidden", children: _jsxs("div", { className: "sidebar-panel flex h-full w-full min-w-0 flex-col px-4 pb-4 pt-3", children: [_jsxs("div", { className: "sidebar-brand mb-4 flex h-9 items-center gap-1.5 text-[18px] font-semibold", children: [_jsx(BrandMark, { className: "size-9" }), _jsx("span", { className: "sidebar-fade truncate", children: "Miravize" })] }), _jsx(NavItems, {}), _jsx(UserFooter, { email: user?.email, name: typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : undefined, avatarUrl: avatarUrlFromUser(user?.user_metadata), onSignOut: () => void signOut() })] }) })] }), _jsxs("div", { className: "flex h-svh min-h-0 min-w-0 flex-1 flex-col", children: [_jsxs("header", { className: "sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-border bg-background px-3 md:hidden", children: [_jsxs(Sheet, { open: open, onOpenChange: setOpen, children: [_jsx(SheetTrigger, { asChild: true, children: _jsx(Button, { variant: "ghost", size: "icon", "aria-label": "Open menu", children: _jsx(List, { "aria-hidden": "true" }) }) }), _jsxs(SheetContent, { children: [_jsxs("div", { className: "mb-4 flex items-center gap-1.5 text-[18px] font-semibold", children: [_jsx(BrandMark, { className: "size-8" }), "Miravize"] }), _jsxs("div", { className: "flex min-h-0 flex-1 flex-col", children: [_jsx(NavItems, { onNavigate: () => setOpen(false) }), _jsx(UserFooter, { email: user?.email, name: typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : undefined, avatarUrl: avatarUrlFromUser(user?.user_metadata), onSignOut: () => void signOut(), onNavigate: () => setOpen(false) })] })] })] }), _jsxs("span", { className: "flex items-center gap-1.5 text-[18px] font-semibold", children: [_jsx(BrandMark, { className: "size-8" }), "Miravize"] }), _jsx("div", { className: "ml-auto", children: _jsx(ThemeToggle, {}) })] }), _jsxs("main", { id: "main", className: timerRoute
                            ? 'flex min-h-0 flex-1 flex-col'
                            : fillRoute
                                ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
                                : 'min-h-0 min-w-0 flex-1 overflow-y-auto', children: [timerRoute ? null : _jsx(RunningBanner, { onPresenceChange: setBannerSpace }), _jsx("div", { className: timerRoute
                                    ? 'contents'
                                    : fillRoute
                                        ? cn('flex min-h-0 flex-1 flex-col', pagePad)
                                        : pagePad, children: _jsx(Outlet, {}) })] })] })] }));
}
