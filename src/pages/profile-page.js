import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BanknotesIcon, BuildingOffice2Icon, ClockIcon, InboxIcon, ListBulletIcon } from '@heroicons/react/24/outline';
import { Desktop, Moon, Sun } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { AccountAvatar } from '@/components/account/account-avatar';
import { SecurityCard } from '@/components/account/security-card';
import { avatarUrlFromUser } from '@/lib/avatar-image';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { ZOOM_STEPS } from '@/components/timer/week-layout';
import { useAuth } from '@/features/auth/auth-context';
import { useWorkspace } from '@/features/workspaces/workspace-context';
import { useDebouncedPreferences } from '@/lib/use-debounced-preferences';
import { CURRENCIES, CURRENCY_SYMBOL, TIMER_SPANS, writeRequestsIncludeDoneStored, writeTasksIncludeDoneStored, } from '@/lib/user-preferences';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
function savedName(metadata) {
    if (!metadata || typeof metadata !== 'object')
        return '';
    const name = metadata.full_name;
    return typeof name === 'string' ? name : '';
}
export function ProfilePage() {
    const { user } = useAuth();
    const { memberships } = useWorkspace();
    const { setTheme } = useTheme();
    const { preferences: prefs, schedule } = useDebouncedPreferences();
    const accountName = savedName(user?.user_metadata);
    const accountEmail = user?.email ?? '';
    const [name, setName] = useState(accountName);
    const [savingAccount, setSavingAccount] = useState(false);
    useEffect(() => {
        setName(accountName);
    }, [accountName, user?.id]);
    const accountDirty = name.trim() !== accountName.trim();
    const stats = useQuery({
        queryKey: ['profile-stats', user?.id, prefs.currency],
        enabled: Boolean(user),
        queryFn: async () => {
            const [entries, tasks, completedRequests] = await Promise.all([
                supabase.from('time_entries').select('duration_seconds, billable, project:projects(currency, hourly_rate)'),
                supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'done'),
                supabase.from('requests').select('id', { count: 'exact', head: true }).eq('status', 'done'),
            ]);
            if (entries.error)
                throw entries.error;
            if (tasks.error)
                throw tasks.error;
            if (completedRequests.error)
                throw completedRequests.error;
            let seconds = 0;
            let money = 0;
            for (const row of entries.data ?? []) {
                const duration = row.duration_seconds ?? 0;
                seconds += duration;
                const project = row.project;
                if (!row.billable || project?.currency !== prefs.currency || project.hourly_rate == null)
                    continue;
                money += (duration / 3600) * Number(project.hourly_rate);
            }
            return {
                seconds,
                money,
                tasks: tasks.count ?? 0,
                completedRequests: completedRequests.count ?? 0,
            };
        },
    });
    async function saveAccount() {
        if (!accountDirty || savingAccount)
            return;
        setSavingAccount(true);
        const { error } = await supabase.auth.updateUser({
            data: { full_name: name.trim() },
        });
        setSavingAccount(false);
        if (error) {
            toast({ tone: 'error', title: "Couldn't save account", description: error.message });
            return;
        }
        setName(name.trim());
    }
    const hours = Math.round((stats.data?.seconds ?? 0) / 3600);
    const money = Math.round(stats.data?.money ?? 0);
    return (_jsxs("div", { className: "flex flex-col gap-4", children: [_jsx("h1", { className: "sr-only", children: "Profile" }), _jsxs("section", { className: "rounded-lg border border-border bg-card p-4", children: [_jsxs("div", { className: "flex gap-4", children: [_jsx(AccountAvatar, { email: accountEmail, avatarUrl: avatarUrlFromUser(user?.user_metadata), size: "lg" }), _jsxs("div", { className: "grid h-20 min-w-0 flex-1 grid-rows-2 gap-2", children: [_jsx(Input, { "aria-label": "Name", className: "h-full", value: name, onChange: (event) => setName(event.target.value) }), _jsx("div", { className: "h-full cursor-not-allowed", children: _jsx(Input, { "aria-label": "Email", type: "email", readOnly: true, tabIndex: -1, className: "pointer-events-none h-full text-muted-foreground", value: accountEmail }) })] })] }), _jsxs("div", { className: "mt-4 flex items-center gap-4", children: [_jsxs("p", { className: "flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground", children: [_jsxs("span", { className: "inline-flex items-center gap-1.5", children: [_jsx(BuildingOffice2Icon, { className: "size-4", "aria-hidden": "true" }), memberships.length, " Workspaces"] }), _jsx("span", { "aria-hidden": "true", children: "|" }), _jsxs("span", { className: "inline-flex items-center gap-1.5", children: [_jsx(ClockIcon, { className: "size-4", "aria-hidden": "true" }), hours, " hours"] }), _jsx("span", { "aria-hidden": "true", children: "|" }), _jsxs("span", { className: "inline-flex items-center gap-1.5", children: [_jsx(BanknotesIcon, { className: "size-4", "aria-hidden": "true" }), money, " ", prefs.currency] }), _jsx("span", { "aria-hidden": "true", children: "|" }), _jsxs("span", { className: "inline-flex items-center gap-1.5", children: [_jsx(ListBulletIcon, { className: "size-4", "aria-hidden": "true" }), stats.data?.tasks ?? 0, " completed tasks"] }), _jsx("span", { "aria-hidden": "true", children: "|" }), _jsxs("span", { className: "inline-flex items-center gap-1.5", children: [_jsx(InboxIcon, { className: "size-4", "aria-hidden": "true" }), stats.data?.completedRequests ?? 0, " completed requests"] })] }), _jsxs("div", { className: "flex shrink-0 gap-2", children: [_jsx(Button, { type: "button", variant: "outline", className: "h-9", disabled: !accountDirty || savingAccount, onClick: () => setName(accountName), children: "Cancel" }), _jsx(Button, { type: "button", className: "h-9", disabled: !accountDirty, loading: savingAccount, onClick: () => void saveAccount(), children: "Save" })] })] })] }), _jsx(SecurityCard, {}), _jsxs("div", { children: [_jsx("p", { className: "mb-2 text-sm font-medium", children: "Preferences" }), _jsxs("section", { className: "grid gap-4 rounded-lg border border-border bg-card p-4", children: [_jsxs("div", { children: [_jsx(Label, { children: "App theme" }), _jsx("div", { className: "mt-2 flex h-9 w-fit overflow-hidden rounded-md border border-border", children: [
                                            ['light', 'Light', Sun],
                                            ['dark', 'Dark', Moon],
                                            ['system', 'System', Desktop],
                                        ].map(([value, text, Icon]) => (_jsxs("button", { type: "button", "aria-pressed": prefs.theme === value, className: cn('inline-flex h-full items-center gap-1.5 px-3 text-sm', prefs.theme === value ? 'bg-foreground text-background' : 'text-muted-foreground'), onClick: () => {
                                                setTheme(value);
                                                schedule({ theme: value });
                                            }, children: [_jsx(Icon, { className: "size-4", "aria-hidden": "true" }), text] }, value))) })] }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "profile-show-done", children: "Show done tasks" }), _jsx("div", { className: "mt-2", children: _jsx(Switch, { id: "profile-show-done", checked: prefs.tasks_include_done, onCheckedChange: (checked) => {
                                                writeTasksIncludeDoneStored(checked);
                                                schedule({ tasks_include_done: checked });
                                            } }) })] }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "profile-show-done-requests", children: "Show done requests" }), _jsx("div", { className: "mt-2", children: _jsx(Switch, { id: "profile-show-done-requests", checked: prefs.requests_include_done, onCheckedChange: (checked) => {
                                                writeRequestsIncludeDoneStored(checked);
                                                schedule({ requests_include_done: checked });
                                            } }) })] }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "profile-currency", children: "Your currency" }), _jsxs(Select, { value: prefs.currency, onValueChange: (value) => schedule({ currency: value }), children: [_jsx(SelectTrigger, { id: "profile-currency", className: "mt-2 h-9 w-40", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: CURRENCIES.map((code) => (_jsxs(SelectItem, { value: code, children: [code, " \u00B7 ", CURRENCY_SYMBOL[code]] }, code))) })] })] }), _jsxs("div", { children: [_jsx(Label, { children: "Default grid view" }), _jsx("div", { className: "mt-2 flex h-9 w-fit overflow-hidden rounded-md border border-border", children: TIMER_SPANS.map((value) => (_jsx("button", { type: "button", "aria-pressed": prefs.timer_span === value, className: cn('h-full px-3 text-sm', prefs.timer_span === value ? 'bg-foreground text-background' : 'text-muted-foreground'), onClick: () => schedule({ timer_span: value }), children: value }, value))) })] }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "profile-zoom", children: "Default zoom level" }), _jsxs(Select, { value: String(prefs.timer_zoom), onValueChange: (value) => schedule({ timer_zoom: Number(value) }), children: [_jsx(SelectTrigger, { id: "profile-zoom", className: "mt-2 h-9 w-40", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: ZOOM_STEPS.map((step) => (_jsxs(SelectItem, { value: String(step), children: [Math.round(step * 100), "%"] }, step))) })] })] })] })] })] }));
}
