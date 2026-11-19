import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Check, Circle, Eye, EyeSlash, X } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { changePassword } from '@/features/auth/change-password';
import { useAuth } from '@/features/auth/auth-context';
import { BACKUP_CONFIRMATION, backupCodesText, createBackupCodes, clearAuthenticatorEnroll, deleteBackupCodes, metadataString, replaceBackupCodes, } from '@/features/auth/mfa';
import { PASSWORD_RULES, passwordIsStrong } from '@/lib/password';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
export function SecurityCard() {
    const { user, assurance, refreshAssurance } = useAuth();
    const navigate = useNavigate();
    const enrolled = assurance.currentLevel === 'aal2' || assurance.nextLevel === 'aal2';
    const deviceName = metadataString(user?.user_metadata, 'mfa_device_name') || 'Authenticator';
    const [removeOpen, setRemoveOpen] = useState(false);
    const [codesOpen, setCodesOpen] = useState(false);
    const [codes, setCodes] = useState([]);
    const [confirmation, setConfirmation] = useState('');
    const [pending, setPending] = useState(false);
    const [copied, setCopied] = useState(false);
    const confirmed = confirmation.trim().toLowerCase() === BACKUP_CONFIRMATION;
    function openCodes() {
        setCodes(createBackupCodes());
        setConfirmation('');
        setCopied(false);
        setCodesOpen(true);
    }
    async function saveCodes() {
        if (!confirmed || pending)
            return;
        setPending(true);
        try {
            await replaceBackupCodes(codes);
            setCodesOpen(false);
        }
        catch (error) {
            toast({
                tone: 'error',
                title: "Couldn't save backup codes",
                description: error instanceof Error ? error.message : 'Try again.',
            });
        }
        finally {
            setPending(false);
        }
    }
    async function remove() {
        if (pending)
            return;
        setPending(true);
        try {
            await deleteBackupCodes();
            const listed = await supabase.auth.mfa.listFactors();
            if (listed.error)
                throw listed.error;
            for (const factor of [...listed.data.totp, ...listed.data.phone]) {
                const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id });
                if (removed.error)
                    throw removed.error;
            }
            const saved = await supabase.auth.updateUser({
                data: {
                    mfa_setup_skipped: true,
                    mfa_reenroll_required: false,
                    mfa_backup_pending: false,
                    mfa_device_name: null,
                },
            });
            if (saved.error)
                throw saved.error;
            await supabase.auth.refreshSession();
            clearAuthenticatorEnroll();
            await refreshAssurance();
            setRemoveOpen(false);
        }
        catch (error) {
            toast({
                tone: 'error',
                title: "Couldn't remove two-factor authentication",
                description: error instanceof Error ? error.message : 'Try again.',
            });
        }
        finally {
            setPending(false);
        }
    }
    async function copyCodes() {
        try {
            await navigator.clipboard.writeText(codes.join('\n'));
            setCopied(true);
            toast({ tone: 'success', title: 'Backup codes copied to clipboard.' });
        }
        catch (error) {
            toast({
                tone: 'error',
                title: "Couldn't copy backup codes",
                description: error instanceof Error ? error.message : 'Try again.',
            });
        }
    }
    function downloadCodes() {
        const file = new Blob([backupCodesText(codes)], { type: 'text/plain' });
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'miravize-backup-codes.txt';
        link.click();
        URL.revokeObjectURL(url);
    }
    return (_jsxs("div", { children: [_jsx("p", { className: "mb-2 text-sm font-medium", children: "Security" }), _jsxs("section", { className: "rounded-lg border border-border bg-card p-4", children: [_jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "text-sm", children: "Two-factor authentication" }), _jsx("p", { className: "text-sm text-muted-foreground", children: enrolled ? deviceName : 'Add an authenticator app to protect this account.' })] }), enrolled ? (_jsxs("div", { className: "flex shrink-0 gap-2", children: [_jsx(Button, { type: "button", variant: "outline", onClick: openCodes, children: "New backup codes" }), _jsx(Button, { type: "button", variant: "outline", onClick: () => setRemoveOpen(true), children: "Remove 2FA" })] })) : (_jsx(Button, { type: "button", onClick: () => navigate('/mfa/setup?return=profile'), children: "Set up 2FA" }))] }), _jsx(ChangePasswordForm, { email: user?.email ?? '' })] }), _jsx(Dialog, { open: removeOpen, onOpenChange: setRemoveOpen, children: _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { className: "font-bold text-destructive", children: "Remove two-factor authentication?" }), _jsx(DialogDescription, { children: "Backup codes for this authenticator stop working." })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { type: "button", variant: "outline", onClick: () => setRemoveOpen(false), disabled: pending, children: "Cancel" }), _jsx(Button, { type: "button", variant: "destructive", onClick: () => void remove(), loading: pending, children: "Remove" })] })] }) }), _jsx(Dialog, { open: codesOpen, onOpenChange: setCodesOpen, children: _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: "Save your backup codes" }), _jsx(DialogDescription, { children: "These replace the previous codes. Each one works once." })] }), _jsx("ul", { className: "grid grid-cols-2 justify-items-center gap-x-8 gap-y-2 rounded-md border border-border bg-muted px-4 py-3 font-mono text-sm", children: codes.map((item) => (_jsx("li", { className: "text-center tracking-wide", children: item }, item))) }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(Button, { type: "button", variant: "outline", onClick: () => void copyCodes(), children: copied ? 'Copied' : 'Copy' }), _jsx(Button, { type: "button", variant: "outline", onClick: downloadCodes, children: "Download" })] }), _jsxs("div", { className: "grid gap-1.5", children: [_jsx(Label, { htmlFor: "profile-backup-confirm", children: "Type \u201CI saved my codes\u201D" }), _jsx(Input, { id: "profile-backup-confirm", autoComplete: "off", value: confirmation, onChange: (event) => setConfirmation(event.target.value) })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { type: "button", variant: "outline", onClick: () => setCodesOpen(false), disabled: pending, children: "Cancel" }), _jsx(Button, { type: "button", onClick: () => void saveCodes(), disabled: !confirmed || pending, loading: pending, children: "Complete" })] })] }) })] }));
}
function ChangePasswordForm({ email }) {
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNext, setShowNext] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [pending, setPending] = useState(false);
    const [nextFocused, setNextFocused] = useState(false);
    const dirty = current.length > 0 || next.length > 0 || confirm.length > 0;
    const different = current.length > 0 && next !== current;
    const canSave = !pending && current.length > 0 && passwordIsStrong(next) && different && next === confirm;
    const hasNext = next.length > 0;
    const unmetRules = PASSWORD_RULES.filter((rule) => !rule.test(next));
    const passwordsMatch = hasNext && next === confirm;
    function clear() {
        setCurrent('');
        setNext('');
        setConfirm('');
        setShowCurrent(false);
        setShowNext(false);
        setShowConfirm(false);
    }
    async function save() {
        if (!canSave)
            return;
        setPending(true);
        try {
            await changePassword(email, current, next);
            clear();
            toast({ tone: 'success', title: 'Password changed.' });
        }
        catch (error) {
            toast({
                tone: 'error',
                title: "Couldn't change password",
                description: error instanceof Error ? error.message : 'Try again.',
            });
        }
        finally {
            setPending(false);
        }
    }
    return (_jsxs("div", { className: "mt-4 border-t border-border pt-4", children: [_jsx("p", { className: "text-sm", children: "Password" }), _jsxs("div", { className: "mt-3 grid max-w-sm gap-3", children: [_jsx(PasswordField, { id: "profile-current-password", label: "Current password", autoComplete: "current-password", value: current, revealed: showCurrent, onChange: setCurrent, onToggle: () => setShowCurrent((open) => !open) }), _jsx(PasswordField, { id: "profile-new-password", label: "New password", autoComplete: "new-password", value: next, revealed: showNext, describedBy: [nextFocused ? 'profile-password-rules' : '', hasNext && !nextFocused && unmetRules.length > 0 ? 'profile-password-summary' : ''].filter(Boolean).join(' ') ||
                            undefined, onChange: setNext, onToggle: () => setShowNext((open) => !open), onActiveChange: setNextFocused, expanded: nextFocused, hint: _jsx("ul", { id: "profile-password-rules", className: "grid gap-1 pt-1", children: PASSWORD_RULES.map((rule) => {
                                const met = rule.test(next);
                                return (_jsxs("li", { className: cn('flex items-center gap-2 text-sm', met ? 'text-foreground' : 'text-muted-foreground'), children: [met ? (_jsx(Check, { className: "size-4 text-primary", weight: "bold", "aria-hidden": true })) : (_jsx(Circle, { className: "size-4", "aria-hidden": true })), rule.label] }, rule.id));
                            }) }), statusOpen: hasNext && !nextFocused && unmetRules.length > 0, status: _jsxs("p", { id: "profile-password-summary", className: "flex items-center gap-2 pt-1 text-sm text-destructive", children: [_jsx(X, { className: "size-4 shrink-0", weight: "bold", "aria-hidden": true }), "Password does not meet the minimum requirements"] }) }), _jsx(PasswordField, { id: "profile-confirm-password", label: "Confirm new password", autoComplete: "new-password", value: confirm, revealed: showConfirm, describedBy: hasNext ? 'profile-confirm-status' : undefined, onChange: setConfirm, onToggle: () => setShowConfirm((open) => !open), expanded: hasNext, hint: _jsxs("p", { id: "profile-confirm-status", className: cn('flex items-center gap-2 pt-1 text-sm', passwordsMatch ? 'text-primary' : 'text-destructive'), children: [passwordsMatch ? (_jsx(Check, { className: "size-4", weight: "bold", "aria-hidden": true })) : (_jsx(X, { className: "size-4", weight: "bold", "aria-hidden": true })), passwordsMatch ? 'Passwords match' : "Passwords don't match"] }) })] }), _jsxs("div", { className: "mt-4 flex justify-end gap-2", children: [_jsx(Button, { type: "button", variant: "outline", className: "h-9", disabled: !dirty || pending, onClick: clear, children: "Cancel" }), _jsx(Button, { type: "button", className: "h-9", disabled: !canSave, loading: pending, onClick: () => void save(), children: "Save" })] })] }));
}
function PasswordField({ id, label, autoComplete, value, revealed, describedBy, hint, expanded = false, status, statusOpen = false, onChange, onToggle, onActiveChange, }) {
    return (_jsxs("div", { className: "grid gap-1.5", onFocus: () => onActiveChange?.(true), onBlur: (event) => {
            const nextFocus = event.relatedTarget;
            if (nextFocus instanceof Node && event.currentTarget.contains(nextFocus))
                return;
            onActiveChange?.(false);
        }, children: [_jsx(Label, { htmlFor: id, children: label }), _jsxs("div", { className: "relative", children: [_jsx(Input, { id: id, type: revealed ? 'text' : 'password', autoComplete: autoComplete, "aria-describedby": describedBy, className: "pr-10", value: value, onChange: (event) => onChange(event.target.value) }), _jsx("button", { type: "button", className: "absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground", onClick: onToggle, "aria-label": revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`, children: revealed ? _jsx(EyeSlash, { className: "size-4" }) : _jsx(Eye, { className: "size-4" }) })] }), hint || status ? (_jsxs("div", { children: [hint ? _jsx(HeightExpand, { open: expanded, children: hint }) : null, status ? _jsx(HeightExpand, { open: statusOpen, children: status }) : null] })) : null] }));
}
function HeightExpand({ open, children }) {
    return (_jsx("div", { className: cn('grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'), children: _jsx("div", { className: cn('min-h-0 overflow-hidden', !open && 'pointer-events-none'), "aria-hidden": !open, children: children }) }));
}
