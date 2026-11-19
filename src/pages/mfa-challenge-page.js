import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { AuthSweepCopy } from '@/components/auth/auth-sweep-copy';
import { OtpCodeField } from '@/components/auth/otp-code-field';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { OTP_LENGTH, clearAuthenticatorEnroll, otpButtonLabel } from '@/features/auth/mfa';
import { functionError } from '@/lib/function-error';
import { supabase } from '@/lib/supabase';
export function MfaChallengePage() {
    const { refreshAssurance } = useAuth();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const next = params.get('next') || '/timer';
    const [code, setCode] = useState('');
    const [backup, setBackup] = useState(false);
    const [backupCode, setBackupCode] = useState('');
    const [pending, setPending] = useState(false);
    async function onSubmit(event) {
        event.preventDefault();
        if (pending)
            return;
        setPending(true);
        const factors = await supabase.auth.mfa.listFactors();
        if (factors.error) {
            setPending(false);
            toast({ tone: 'error', title: "Couldn't check authenticator", description: factors.error.message });
            return;
        }
        const factor = factors.data.totp.find((item) => item.status === 'verified') ?? factors.data.totp[0];
        if (!factor) {
            setPending(false);
            toast({ tone: 'error', title: "Couldn't check authenticator", description: 'No authenticator is enrolled.' });
            return;
        }
        const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
        if (challenge.error) {
            setPending(false);
            toast({ tone: 'error', title: "Couldn't check authenticator", description: challenge.error.message });
            return;
        }
        const verified = await supabase.auth.mfa.verify({
            factorId: factor.id,
            challengeId: challenge.data.id,
            code,
        });
        if (verified.error) {
            setPending(false);
            setCode('');
            toast({ tone: 'error', title: "Couldn't log in", description: verified.error.message });
            return;
        }
        await refreshAssurance();
        navigate(next, { replace: true });
    }
    async function redeem(event) {
        event.preventDefault();
        if (pending || !backupCode.trim())
            return;
        setPending(true);
        const { error } = await supabase.functions.invoke('redeem-backup-code', {
            body: { code: backupCode },
        });
        if (error) {
            setPending(false);
            toast({
                tone: 'error',
                title: "Couldn't use backup code",
                description: await functionError(error, 'That backup code is not valid.'),
            });
            return;
        }
        clearAuthenticatorEnroll();
        await supabase.auth.refreshSession();
        await refreshAssurance();
        navigate(`/mfa/setup?next=${encodeURIComponent(next)}`, { replace: true });
    }
    async function signOut() {
        await supabase.auth.signOut();
    }
    if (backup) {
        return (_jsxs("form", { className: "flex flex-col gap-5", onSubmit: (event) => void redeem(event), children: [_jsx(Header, { title: "Use a backup code", subtitle: "Each code works once. You'll set up a new authenticator next." }), _jsxs("div", { className: "grid gap-1.5", children: [_jsx(Label, { htmlFor: "backup-code", children: "Backup code" }), _jsx(Input, { id: "backup-code", autoComplete: "off", autoFocus: true, value: backupCode, onChange: (event) => setBackupCode(event.target.value) })] }), _jsx(Button, { type: "submit", className: "h-10", disabled: pending || !backupCode.trim(), loading: pending, children: "Log in" }), _jsx("button", { type: "button", className: "text-center text-sm text-[#5e5c57] underline-offset-4 hover:underline", onClick: () => setBackup(false), children: "Use authenticator code" }), _jsx(SignOut, { onClick: () => void signOut() })] }));
    }
    return (_jsxs("form", { className: "flex flex-col gap-5", onSubmit: (event) => void onSubmit(event), children: [_jsx(Header, { title: "Two-factor authentication", subtitle: "Enter the code from your authenticator app." }), _jsx(OtpCodeField, { id: "mfa-code", value: code, onChange: setCode, autoFocus: true }), _jsx(Button, { type: "submit", className: "h-10", disabled: pending || code.length < OTP_LENGTH, loading: pending, children: otpButtonLabel(code.length, 'Log in') }), _jsx("button", { type: "button", className: "text-center text-sm text-[#5e5c57] underline-offset-4 hover:underline", onClick: () => setBackup(true), children: "Lost access? Use a backup code" }), _jsx(SignOut, { onClick: () => void signOut() })] }));
}
function Header({ title, subtitle }) {
    return (_jsxs("div", { className: "flex flex-col items-center gap-3 text-center", children: [_jsx(BrandMark, { onLight: true, className: "size-16" }), _jsxs("div", { className: "grid gap-1", children: [_jsx(AuthSweepCopy, { as: "h1", className: "text-2xl font-medium tracking-tight", children: title }), _jsx(AuthSweepCopy, { delay: true, className: "text-sm text-[#5e5c57]", children: subtitle })] })] }));
}
function SignOut({ onClick }) {
    return (_jsx("p", { className: "text-center text-sm text-[#5e5c57]", children: _jsx("button", { type: "button", className: "underline-offset-4 hover:underline", onClick: onClick, children: "Sign out" }) }));
}
