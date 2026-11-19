import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ClipboardDocumentIcon, PencilIcon, UserPlusIcon, UsersIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { decodeWorkspaceIcon, encodeWorkspaceIcon, HERO_PRESETS, WorkspaceMark, } from '@/components/workspaces/workspace-icon';
import { useAuth } from '@/features/auth/auth-context';
import { ALL_WORKSPACES, useWorkspace } from '@/features/workspaces/workspace-context';
import { qk } from '@/lib/query-keys';
import { supabase } from '@/lib/supabase';
import { suggestWorkspaceIdCode, workspaceIdInput } from '@/lib/workspace-id-code';
import { cn } from '@/lib/utils';
async function inviteFailure(err) {
    const context = err && typeof err === 'object' && 'context' in err
        ? err.context
        : undefined;
    if (context && typeof context.json === 'function') {
        const body = (await context.json().catch(() => null));
        if (body && typeof body.error === 'string' && body.error)
            return body.error;
    }
    if (err instanceof Error && err.message)
        return err.message;
    return 'Try again.';
}
export function SettingsPage() {
    const { user } = useAuth();
    const { workspaceId, isAll, memberships, setWorkspaceId } = useWorkspace();
    const qc = useQueryClient();
    const [selectedId, setSelectedId] = useState(null);
    const [workspaceQuery, setWorkspaceQuery] = useState('');
    const [userQuery, setUserQuery] = useState('');
    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteChips, setInviteChips] = useState([]);
    const [inviteDraft, setInviteDraft] = useState('');
    const [inviteWorkspaceId, setInviteWorkspaceId] = useState('');
    const [inviteRole, setInviteRole] = useState('member');
    const [name, setName] = useState('');
    const [hero, setHero] = useState(null);
    const [custom, setCustom] = useState('');
    const [draftName, setDraftName] = useState('');
    const [draftId, setDraftId] = useState('');
    const [idConfirm, setIdConfirm] = useState(null);
    const [draftHero, setDraftHero] = useState(null);
    const [draftCustom, setDraftCustom] = useState('');
    const [confirm, setConfirm] = useState(null);
    const visible = useMemo(() => (isAll ? memberships : memberships.filter((row) => row.workspace_id === workspaceId)), [isAll, memberships, workspaceId]);
    const manageable = useMemo(() => memberships.filter((row) => row.role === 'owner' || row.role === 'admin'), [memberships]);
    useEffect(() => {
        if (!visible.some((row) => row.workspace_id === selectedId)) {
            setSelectedId(visible[0]?.workspace_id ?? null);
        }
    }, [selectedId, visible]);
    const selected = visible.find((row) => row.workspace_id === selectedId) ?? null;
    const canManage = selected?.role === 'owner' || selected?.role === 'admin';
    const loadedName = selected?.workspace.name;
    const loadedIcon = selected?.workspace.icon ?? null;
    const loadedWorkspaceId = selected?.workspace_id;
    useEffect(() => {
        if (!loadedWorkspaceId)
            return;
        const decoded = decodeWorkspaceIcon(loadedIcon);
        setName(loadedName ?? '');
        setHero(decoded.hero);
        setCustom(decoded.custom);
    }, [loadedIcon, loadedName, loadedWorkspaceId]);
    const encoded = encodeWorkspaceIcon(custom, hero);
    const dirty = Boolean(selected) &&
        (name.trim() !== selected?.workspace.name.trim() || !encoded.ok || encoded.value !== loadedIcon);
    const peopleQueries = useQueries({
        queries: visible.map((row) => ({
            queryKey: qk.members(row.workspace_id),
            queryFn: async () => {
                const { data, error } = await supabase.rpc('workspace_people', { p_workspace_id: row.workspace_id });
                if (error)
                    throw error;
                return (data ?? []);
            },
        })),
    });
    const inviteSources = useMemo(() => visible.filter((row) => row.role === 'owner' || row.role === 'admin'), [visible]);
    const inviteQueries = useQueries({
        queries: inviteSources.map((row) => ({
            queryKey: qk.invites(row.workspace_id),
            queryFn: async () => {
                const { data, error } = await supabase
                    .from('workspace_invites')
                    .select('*')
                    .eq('workspace_id', row.workspace_id)
                    .order('created_at', { ascending: false });
                if (error)
                    throw error;
                return (data ?? []);
            },
        })),
    });
    const access = useMemo(() => {
        const rows = [];
        visible.forEach((membership, index) => {
            const people = peopleQueries[index]?.data ?? [];
            for (const person of people) {
                rows.push({
                    key: person.id,
                    email: person.email,
                    workspaceId: membership.workspace_id,
                    role: person.role,
                    status: 'accepted',
                    memberId: person.id,
                    userId: person.user_id,
                    canRemove: membership.role === 'owner' && person.role !== 'owner',
                });
            }
        });
        inviteSources.forEach((membership, index) => {
            const invites = inviteQueries[index]?.data ?? [];
            for (const invite of invites) {
                if (invite.accepted_at)
                    continue;
                const already = rows.some((row) => row.workspaceId === invite.workspace_id && row.email.toLowerCase() === invite.email.toLowerCase());
                if (already)
                    continue;
                rows.push({
                    key: invite.id,
                    email: invite.email,
                    workspaceId: invite.workspace_id,
                    role: invite.role,
                    status: 'pending',
                    inviteId: invite.id,
                    canRemove: true,
                });
            }
        });
        return rows;
    }, [inviteQueries, inviteSources, peopleQueries, visible]);
    const selectedAccess = access.filter((row) => row.workspaceId === selected?.workspace_id);
    const shownAccess = useMemo(() => {
        const query = userQuery.trim().toLowerCase();
        if (!query)
            return selectedAccess;
        return selectedAccess.filter((row) => row.email.toLowerCase().includes(query));
    }, [selectedAccess, userQuery]);
    const inviteEmails = useMemo(() => {
        const draft = normalizeEmail(inviteDraft);
        if (!draft || inviteChips.includes(draft))
            return inviteChips;
        return [...inviteChips, draft];
    }, [inviteChips, inviteDraft]);
    const memberCounts = useMemo(() => {
        const counts = new Map();
        visible.forEach((row, index) => {
            const people = peopleQueries[index]?.data;
            if (people)
                counts.set(row.workspace_id, people.length);
        });
        return counts;
    }, [peopleQueries, visible]);
    const listed = useMemo(() => {
        const query = workspaceQuery.trim().toLowerCase();
        if (!query)
            return visible;
        return visible.filter((row) => row.workspace.name.toLowerCase().includes(query));
    }, [visible, workspaceQuery]);
    const draftIcon = encodeWorkspaceIcon(draftCustom, draftHero);
    const draftSuggestion = suggestWorkspaceIdCode(draftName);
    const confirmedCode = (idConfirm ?? '').trim() || draftSuggestion;
    async function refreshPeople() {
        await Promise.all([
            qc.invalidateQueries({ queryKey: ['members'] }),
            qc.invalidateQueries({ queryKey: ['invites'] }),
            qc.invalidateQueries({ queryKey: qk.memberships }),
        ]);
    }
    const save = useMutation({
        mutationFn: async () => {
            if (!selected)
                return;
            const next = encodeWorkspaceIcon(custom, hero);
            if (!next.ok)
                throw new Error('Use one emoji or up to two letters.');
            const { error } = await supabase.rpc('update_workspace', {
                p_workspace_id: selected.workspace_id,
                p_name: name.trim(),
                p_icon: next.value,
            });
            if (error)
                throw error;
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: qk.memberships });
        },
        onError: (err) => toast({ tone: 'error', title: "Couldn't save workspace", description: err.message }),
    });
    const createWs = useMutation({
        mutationFn: async (idCode) => {
            const icon = encodeWorkspaceIcon(draftCustom, draftHero);
            if (!icon.ok)
                throw new Error('Use one emoji or up to two letters.');
            const taken = memberships.some((row) => row.workspace.id_code === idCode);
            if (taken)
                throw new Error(`ID ${idCode} is already used.`);
            const { data, error } = await supabase.rpc('create_workspace', {
                p_name: draftName.trim(),
                p_id_code: idCode,
            });
            if (error)
                throw error;
            const id = data.id;
            if (icon.value) {
                const { error: updateError } = await supabase.rpc('update_workspace', {
                    p_workspace_id: id,
                    p_name: draftName.trim(),
                    p_icon: icon.value,
                });
                if (updateError)
                    throw updateError;
            }
            return { id };
        },
        onSuccess: async (data) => {
            await qc.invalidateQueries({ queryKey: qk.memberships });
            setDraftName('');
            setDraftId('');
            setIdConfirm(null);
            setDraftHero(null);
            setDraftCustom('');
            if (data?.id) {
                setSelectedId(data.id);
                setWorkspaceId(data.id);
            }
        },
        onError: (err) => toast({ tone: 'error', title: "Couldn't create workspace", description: err.message }),
    });
    function startCreate() {
        if (!draftName.trim() || !draftIcon.ok || createWs.isPending)
            return;
        if (!draftId.trim()) {
            setIdConfirm(draftSuggestion);
            return;
        }
        createWs.mutate(draftId.trim());
    }
    const sendInvites = useMutation({
        mutationFn: async () => {
            for (const email of inviteEmails) {
                const { data, error } = await supabase.rpc('invite_to_workspace', {
                    p_workspace_id: inviteWorkspaceId,
                    p_email: email,
                    p_role: inviteRole,
                });
                if (error)
                    throw error;
                const invite = data;
                if (!invite?.id)
                    throw new Error('Invite saved, but the email could not be sent.');
                const { data: sent, error: fnErr } = await supabase.functions.invoke('send-invite', {
                    body: { invite_id: invite.id, origin: window.location.origin },
                });
                if (fnErr)
                    throw new Error(await inviteFailure(fnErr));
                if (sent && typeof sent === 'object' && 'error' in sent && sent.error) {
                    throw new Error(String(sent.error));
                }
            }
        },
        onSuccess: async () => {
            setInviteOpen(false);
            setInviteChips([]);
            setInviteDraft('');
            setInviteRole('member');
            await refreshPeople();
        },
        onError: (err) => toast({ tone: 'error', title: "Couldn't send invite", description: err.message }),
    });
    const revokeInvite = useMutation({
        mutationFn: async (id) => {
            const { error } = await supabase.rpc('revoke_workspace_invite', { p_invite_id: id });
            if (error)
                throw error;
        },
        onSuccess: async () => {
            setConfirm(null);
            await refreshPeople();
        },
        onError: (err) => toast({ tone: 'error', title: "Couldn't delete invite", description: err.message }),
    });
    const removeMember = useMutation({
        mutationFn: async (id) => {
            const { error } = await supabase.from('workspace_members').delete().eq('id', id);
            if (error)
                throw error;
        },
        onSuccess: async () => {
            setConfirm(null);
            await refreshPeople();
        },
        onError: (err) => toast({ tone: 'error', title: "Couldn't delete member", description: err.message }),
    });
    function openInvite() {
        const preferred = manageable.find((row) => row.workspace_id === selected?.workspace_id) ?? manageable[0];
        setInviteWorkspaceId(preferred?.workspace_id ?? '');
        setInviteRole('member');
        setInviteChips([]);
        setInviteDraft('');
        setInviteOpen(true);
    }
    function askRemove(row) {
        if (!row.canRemove)
            return;
        if (row.status === 'pending' && row.inviteId) {
            setConfirm({ kind: 'invite', id: row.inviteId, name: row.email });
            return;
        }
        if (row.memberId)
            setConfirm({ kind: 'member', id: row.memberId, name: row.email });
    }
    return (_jsxs("div", { className: "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto lg:overflow-hidden", children: [_jsx("h1", { className: "sr-only", children: "Settings" }), _jsxs("div", { className: "grid min-h-0 flex-1 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]", children: [_jsxs("div", { className: "flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card", children: [_jsx("div", { className: "shrink-0 border-b border-border p-2", children: _jsx(Input, { "aria-label": "Search workspaces", className: "h-9", value: workspaceQuery, onChange: (event) => setWorkspaceQuery(event.target.value) }) }), _jsx("ul", { className: "min-h-0 flex-1 overflow-y-auto", children: listed.length === 0 ? (_jsx("li", { className: "px-2.5 py-2 text-sm text-muted-foreground", children: visible.length === 0 ? 'No workspaces yet.' : 'No matches.' })) : (listed.map((row) => {
                                    const count = memberCounts.get(row.workspace_id);
                                    return (_jsx("li", { className: "border-t border-border first:border-t-0", children: _jsxs("button", { type: "button", className: cn('flex h-9 w-full items-center gap-2 px-2.5 text-left', selected?.id === row.id && 'bg-muted'), onClick: () => setSelectedId(row.workspace_id), children: [_jsx(WorkspaceMark, { icon: row.workspace.icon }), _jsx("span", { className: "min-w-0 truncate text-sm", children: row.workspace.name }), count != null ? (_jsxs("span", { className: "inline-flex h-5 shrink-0 items-center gap-1 rounded-md border border-border bg-card px-1.5 text-xs text-muted-foreground", children: [_jsx(UsersIcon, { className: "size-3.5", "aria-hidden": "true" }), count] })) : null, _jsx("span", { className: "ml-auto shrink-0 text-xs capitalize text-muted-foreground", children: row.role })] }) }, row.id));
                                })) }), _jsxs("div", { className: "flex shrink-0 items-center gap-2 border-t border-border p-2", children: [_jsx(IconChooser, { hero: draftHero, custom: draftCustom, onHero: (value) => {
                                            setDraftHero(value);
                                            setDraftCustom('');
                                        }, onCustom: (value) => {
                                            setDraftCustom(value);
                                            if (value.trim())
                                                setDraftHero(null);
                                        }, children: _jsx("button", { type: "button", "aria-label": "Choose icon", className: "inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border", children: _jsx(WorkspaceMark, { icon: draftIcon.ok ? draftIcon.value : null }) }) }), _jsx(Input, { "aria-label": "Name", className: "h-9 min-w-0 flex-1", value: draftName, onChange: (event) => setDraftName(event.target.value), onKeyDown: (event) => {
                                            if (event.key === 'Enter')
                                                startCreate();
                                        } }), _jsx(Input, { "aria-label": "ID", className: "h-9 w-[3.4rem] shrink-0 text-center uppercase", placeholder: draftSuggestion, value: draftId, onChange: (event) => setDraftId(workspaceIdInput(event.target.value)), onKeyDown: (event) => {
                                            if (event.key === 'Enter')
                                                startCreate();
                                        } }), _jsx(Button, { type: "button", className: "h-9 shrink-0 px-2.5", disabled: !draftName.trim() || !draftIcon.ok, loading: createWs.isPending, onClick: startCreate, children: "+ Add" })] })] }), _jsxs("div", { className: "flex h-full min-h-0 flex-col gap-4", children: [selected ? (_jsx(WorkspaceFields, { name: name, idCode: selected.workspace.id_code, canManage: canManage, hero: hero, custom: custom, preview: encoded.ok ? encoded.value : loadedIcon, dirty: dirty && Boolean(name.trim()), saving: save.isPending, onName: setName, onHero: (value) => {
                                    setHero(value);
                                    setCustom('');
                                }, onCustom: (value) => {
                                    setCustom(value);
                                    if (value.trim())
                                        setHero(null);
                                }, onDefault: () => {
                                    setHero(null);
                                    setCustom('');
                                }, onSave: () => save.mutate() })) : workspaceId === ALL_WORKSPACES ? (_jsx("p", { className: "text-sm text-muted-foreground", children: "Create a workspace to get started." })) : null, selected ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex shrink-0 items-center gap-2", children: [_jsx(Input, { "aria-label": "Search", className: "h-9 w-56", placeholder: "Search", value: userQuery, onChange: (event) => setUserQuery(event.target.value) }), manageable.length > 0 ? (_jsxs(Button, { type: "button", className: "ml-auto h-9", onClick: openInvite, children: [_jsx(UserPlusIcon, { className: "size-4", "aria-hidden": "true" }), "User"] })) : null] }), _jsx("div", { className: "min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card", children: _jsx("div", { className: "h-full overflow-auto", children: _jsx(AccessTable, { rows: shownAccess, youId: user?.id, onRemove: askRemove, empty: userQuery.trim() ? 'No matches.' : 'No one has access yet.' }) }) })] })) : null] })] }), _jsx(Dialog, { open: idConfirm !== null, onOpenChange: (open) => { if (!open)
                    setIdConfirm(null); }, children: _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsxs(DialogTitle, { children: ["Use ID ", confirmedCode, "?"] }), _jsxs(DialogDescription, { children: ["Tasks and requests will look like T-", confirmedCode, "01 and R-", confirmedCode, "01."] })] }), _jsx(Input, { "aria-label": "ID", className: "h-9 uppercase", value: idConfirm ?? '', onChange: (event) => setIdConfirm(workspaceIdInput(event.target.value)) }), _jsxs(DialogFooter, { children: [_jsx(Button, { type: "button", variant: "outline", onClick: () => setIdConfirm(null), children: "Cancel" }), _jsx(Button, { type: "button", loading: createWs.isPending, disabled: !confirmedCode, onClick: () => createWs.mutate(confirmedCode), children: "Create" })] })] }) }), _jsx(Dialog, { open: Boolean(confirm), onOpenChange: (open) => { if (!open)
                    setConfirm(null); }, children: _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { className: "font-bold text-destructive", children: confirm?.kind === 'member' ? `Delete ${confirm.name}?` : 'Delete invite?' }), _jsx(DialogDescription, { children: "This action is irreversible." })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { type: "button", variant: "outline", onClick: () => setConfirm(null), children: "Cancel" }), _jsx(Button, { type: "button", variant: "destructive", loading: revokeInvite.isPending || removeMember.isPending, onClick: () => {
                                        if (!confirm)
                                            return;
                                        if (confirm.kind === 'invite')
                                            revokeInvite.mutate(confirm.id);
                                        else
                                            removeMember.mutate(confirm.id);
                                    }, children: "Delete" })] })] }) }), _jsx(Dialog, { open: inviteOpen, onOpenChange: setInviteOpen, children: _jsx(DialogContent, { children: _jsxs("form", { className: "grid gap-3", onSubmit: (event) => {
                            event.preventDefault();
                            if (inviteEmails.length === 0 || !inviteWorkspaceId)
                                return;
                            sendInvites.mutate();
                        }, children: [_jsx(DialogHeader, { className: "sr-only", children: _jsx(DialogTitle, { children: "Invite" }) }), _jsx(EmailChips, { chips: inviteChips, draft: inviteDraft, onChips: setInviteChips, onDraft: setInviteDraft }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsxs(Select, { value: inviteWorkspaceId, onValueChange: setInviteWorkspaceId, children: [_jsx(SelectTrigger, { className: "h-9", "aria-label": "Workspace", children: _jsx(SelectValue, { placeholder: "Workspace" }) }), _jsx(SelectContent, { children: manageable.map((row) => (_jsx(SelectItem, { value: row.workspace_id, children: row.workspace.name }, row.workspace_id))) })] }), _jsxs(Select, { value: inviteRole, onValueChange: (value) => setInviteRole(value), children: [_jsx(SelectTrigger, { className: "h-9", "aria-label": "Role", children: _jsx(SelectValue, { placeholder: "Role" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "member", children: "Member" }), _jsx(SelectItem, { value: "admin", children: "Admin" })] })] })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { type: "button", variant: "outline", onClick: () => setInviteOpen(false), children: "Cancel" }), _jsx(Button, { type: "submit", disabled: inviteEmails.length === 0 || !inviteWorkspaceId, loading: sendInvites.isPending, children: "Invite" })] })] }) }) })] }));
}
function IconChooser({ hero, custom, onHero, onCustom, children, }) {
    return (_jsxs(Popover, { children: [_jsx(PopoverTrigger, { asChild: true, children: children }), _jsxs(PopoverContent, { className: "w-80", children: [_jsx("div", { className: "grid grid-cols-8 gap-1", children: HERO_PRESETS.map((preset) => {
                            const Icon = preset.icon;
                            return (_jsx("button", { type: "button", "aria-label": preset.name.replace(/Icon$/, ''), className: cn('flex size-8 items-center justify-center rounded-md hover:bg-muted', hero === preset.name && !custom.trim() && 'bg-muted'), onClick: () => onHero(preset.name), children: _jsx(Icon, { className: "size-4", "aria-hidden": "true" }) }, preset.name));
                        }) }), _jsx(Input, { className: "mt-3 h-9", "aria-label": "Emoji or letters", placeholder: "Emoji or 2 letters", value: custom, onChange: (event) => onCustom(event.target.value) })] })] }));
}
function WorkspaceFields({ name, idCode, canManage, hero, custom, preview, dirty, saving, onName, onHero, onCustom, onDefault, onSave, }) {
    return (_jsxs("div", { className: "shrink-0 rounded-lg border border-border bg-card p-4", children: [_jsx(Label, { htmlFor: "ws-name", children: "Name of workspace" }), _jsx(Input, { id: "ws-name", className: "mt-2 h-9", value: name, disabled: !canManage, onChange: (event) => onName(event.target.value) }), _jsxs("div", { className: "mt-3 flex items-center gap-2", children: [_jsx("span", { className: "inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border", children: _jsx(WorkspaceMark, { icon: preview }) }), _jsx(IconChooser, { hero: hero, custom: custom, onHero: onHero, onCustom: onCustom, children: _jsx(Button, { type: "button", variant: "outline", className: "h-9", disabled: !canManage, children: "Change icon" }) }), _jsx(Button, { type: "button", variant: "outline", className: "h-9", disabled: !canManage, onClick: onDefault, children: "Reset icon" }), _jsx("span", { "aria-hidden": "true", className: "mx-1 h-5 w-px shrink-0 bg-border" }), _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx("div", { className: "w-[3.4rem] cursor-not-allowed", children: _jsx(Input, { "aria-label": "Task and request ID", readOnly: true, tabIndex: -1, value: idCode, className: "pointer-events-none h-9 text-center text-muted-foreground" }) }) }), _jsx(TooltipContent, { children: "This is the task and request identifier." })] }), canManage ? (_jsx(Button, { type: "button", className: "ml-auto h-9", disabled: !dirty, loading: saving, onClick: onSave, children: "Save" })) : null] })] }));
}
function normalizeEmail(value) {
    const email = value.trim().toLowerCase();
    if (!email.includes('@') || !email.split('@')[1]?.includes('.'))
        return null;
    return email;
}
function absorbEmails(chips, value, flush) {
    const parts = value.split(/[\s,;]+/);
    const endsWithBreak = /[\s,;]$/.test(value);
    const pending = !flush && !endsWithBreak ? (parts.pop() ?? '') : '';
    const next = [...chips];
    for (const part of parts) {
        const email = normalizeEmail(part);
        if (!email || next.includes(email))
            continue;
        next.push(email);
    }
    return { chips: next, draft: pending };
}
function EmailChips({ chips, draft, onChips, onDraft, }) {
    const field = useRef(null);
    const [editing, setEditing] = useState(null);
    const [editValue, setEditValue] = useState('');
    function copyEmail(email) {
        void navigator.clipboard.writeText(email).catch(() => {
            toast({ tone: 'error', title: "Couldn't copy email", description: email });
        });
    }
    function saveEdit() {
        if (editing == null)
            return;
        const email = normalizeEmail(editValue);
        const index = editing;
        setEditing(null);
        if (!email || (chips.includes(email) && chips[index] !== email))
            return;
        onChips(chips.map((chip, chipIndex) => (chipIndex === index ? email : chip)));
    }
    return (_jsxs("div", { className: "flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1", onMouseDown: (event) => {
            if (event.target === event.currentTarget) {
                event.preventDefault();
                field.current?.focus();
            }
        }, children: [chips.map((email, index) => editing === index ? (_jsx("input", { "aria-label": `Edit ${email}`, autoFocus: true, className: "h-6 w-40 rounded-md border border-border bg-background px-1.5 text-xs outline-none", value: editValue, onChange: (event) => setEditValue(event.target.value), onBlur: saveEdit, onKeyDown: (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        saveEdit();
                    }
                    if (event.key === 'Escape')
                        setEditing(null);
                } }, `${email}-edit`)) : (_jsxs("span", { className: "group relative inline-flex h-6 max-w-full items-center rounded-md border border-border px-1.5 text-xs", children: [_jsx("span", { className: "truncate", children: email }), _jsxs("span", { className: "absolute inset-0 hidden items-center justify-center gap-1 rounded-md bg-foreground/80 text-background group-hover:flex", children: [_jsx("button", { type: "button", className: "inline-flex size-4 items-center justify-center", "aria-label": `Edit ${email}`, onClick: () => {
                                    setEditing(index);
                                    setEditValue(email);
                                }, children: _jsx(PencilIcon, { className: "size-3.5" }) }), _jsx("button", { type: "button", className: "inline-flex size-4 items-center justify-center", "aria-label": `Copy ${email}`, onClick: () => copyEmail(email), children: _jsx(ClipboardDocumentIcon, { className: "size-3.5" }) }), _jsx("button", { type: "button", className: "inline-flex size-4 items-center justify-center", "aria-label": `Remove ${email}`, onClick: () => onChips(chips.filter((chip) => chip !== email)), children: _jsx(XMarkIcon, { className: "size-3.5" }) })] })] }, email))), _jsx("input", { ref: field, "aria-label": "Emails", className: "h-6 min-w-32 flex-1 bg-transparent text-sm outline-none", placeholder: chips.length === 0 ? 'Add 1 or more emails' : '', value: draft, onChange: (event) => {
                    const value = event.target.value;
                    if (/[\s,;]/.test(value)) {
                        const next = absorbEmails(chips, value, false);
                        onChips(next.chips);
                        onDraft(next.draft);
                        return;
                    }
                    onDraft(value);
                }, onKeyDown: (event) => {
                    if (event.key === 'Enter' || event.key === ',') {
                        event.preventDefault();
                        const next = absorbEmails(chips, event.currentTarget.value, true);
                        onChips(next.chips);
                        onDraft('');
                        return;
                    }
                    if (event.key === 'Backspace' && event.currentTarget.value === '' && chips.length > 0) {
                        onChips(chips.slice(0, -1));
                    }
                }, onPaste: (event) => {
                    const text = event.clipboardData.getData('text');
                    if (!/[\s,;]/.test(text))
                        return;
                    event.preventDefault();
                    const next = absorbEmails(chips, text, true);
                    onChips(next.chips);
                    onDraft(next.draft);
                }, onBlur: (event) => {
                    const next = absorbEmails(chips, event.currentTarget.value, true);
                    onChips(next.chips);
                    onDraft(next.draft);
                } })] }));
}
function AccessTable({ rows, youId, onRemove, empty, }) {
    if (rows.length === 0)
        return _jsx("p", { className: "px-3 py-3 text-sm text-muted-foreground", children: empty });
    return (_jsxs(Table, { className: "w-max min-w-full", children: [_jsx(TableHeader, { className: "[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card", children: _jsxs(TableRow, { children: [_jsx(TableHead, { children: "Email" }), _jsx(TableHead, { children: "Role" }), _jsx(TableHead, { children: "Status" }), _jsx(TableHead, { className: "sticky right-0 z-20 w-20 border-l border-border bg-card", children: _jsx("span", { className: "sr-only", children: "Remove" }) })] }) }), _jsx(TableBody, { children: rows.map((row) => (_jsxs(TableRow, { children: [_jsxs(TableCell, { className: "whitespace-nowrap", children: [row.email, row.userId === youId ? ' (you)' : ''] }), _jsx(TableCell, { className: "capitalize", children: row.role }), _jsx(TableCell, { className: "text-muted-foreground", children: row.status }), _jsx(TableCell, { className: "sticky right-0 border-l border-border bg-card", children: row.canRemove ? (_jsx("button", { type: "button", className: "inline-flex size-7 items-center justify-center rounded-md hover:bg-muted", "aria-label": row.status === 'pending' ? `Delete invite for ${row.email}` : `Delete ${row.email}`, onClick: () => onRemove(row), children: _jsx(XMarkIcon, { className: "size-4" }) })) : null })] }, row.key))) })] }));
}
