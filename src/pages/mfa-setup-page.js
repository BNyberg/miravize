import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { AuthSweepCopy } from '@/components/auth/auth-sweep-copy';
import { OtpCodeField } from '@/components/auth/otp-code-field';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { BACKUP_CONFIRMATION, OTP_LENGTH, backupCodesText, clearAuthenticatorEnroll, createBackupCodes, enrollAuthenticator, factorIsMissing, groupSecret, metadataFlag, otpButtonLabel, qrSource, replaceBackupCodes, } from '@/features/auth/mfa';
import { supabase } from '@/lib/supabase';
export function MfaSetupPage() {
    const { user, gate, assurance, setHold, refreshAssurance } = useAuth();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const next = params.get('return') === 'profile' ? '/profile' : params.get('next') || '/timer';
    const reenroll = metadataFlag(user?.user_metadata, 'mfa_reenroll_required');
    const resumeBackup = gate === 'backup' || metadataFlag(user?.user_metadata, 'mfa_backup_pending');
    const [step, setStep] = useState(resumeBackup ? 2 : 1);
    const [factorId, setFactorId] = useState('');
    const [qr, setQr] = useState('');
    const [secret, setSecret] = useState('');
    const [code, setCode] = useState('');
    const [deviceName, setDeviceName] = useState('');
    const [codes, setCodes] = useState([]);
    const [confirmation, setConfirmation] = useState('');
    const [pending, setPending] = useState(false);
    const [copied, setCopied] = useState(false);
    const codesRequested = useRef(false);
    const confirmed = confirmation.trim().toLowerCase() === BACKUP_CONFIRMATION;
    useEffect(() => {
        if (step !== 1)
            return;
        let alive = true;
        void enrollAuthenticator(0, { force: reenroll }).then((result) => {
            if (!alive)
                return;
            if ('error' in result) {
                toast({ tone: 'error', title: "Couldn't start setup", description: result.error });
                return;
            }
            if ('verified' in result) {
                if (reenroll)
                    return;
                navigate(next, { replace: true });
                return;
            }
            setFactorId(result.id);
            setQr(result.qr);
            setSecret(result.secret);
        });
        return () => {
            alive = false;
        };
    }, [navigate, next, reenroll, step]);
    useEffect(() => {
        if (step !== 2 || codesRequested.current || codes.length > 0)
            return;
        if (assurance.currentLevel !== 'aal2')
            return;
        codesRequested.current = true;
        const nextCodes = createBackupCodes();
        setCodes(nextCodes);
        void replaceBackupCodes(nextCodes).catch((error) => {
            codesRequested.current = false;
            setCodes([]);
            toast({ tone: 'error', title: "Couldn't save backup codes", description: error.message });
        });
    }, [assurance.currentLevel, codes.length, step]);
    async function continueSetup(event) {
        event.preventDefault();
        if (pending || code.length < OTP_LENGTH || !factorId)
            return;
        setPending(true);
        setHold('backup');
        const challenge = await supabase.auth.mfa.challenge({ factorId });
        if (challenge.error) {
            setHold(null);
            setPending(false);
            toast({ tone: 'error', title: "Couldn't verify code", description: challenge.error.message });
            return;
        }
        const verified = await supabase.auth.mfa.verify({
            factorId,
            challengeId: challenge.data.id,
            code,
        });
        if (verified.error) {
            setHold(null);
            setPending(false);
            setCode('');
            toast({ tone: 'error', title: "Couldn't verify code", description: verified.error.message });
            return;
        }
        const nextCodes = createBackupCodes();
        try {
            await replaceBackupCodes(nextCodes);
        }
        catch (error) {
            setHold(null);
            setPending(false);
            toast({
                tone: 'error',
                title: "Couldn't save backup codes",
                description: error instanceof Error ? error.message : 'Try again.',
            });
            return;
        }
        const name = deviceName.trim();
        const saved = await supabase.auth.updateUser({
            data: {
                mfa_backup_pending: true,
                mfa_reenroll_required: false,
                mfa_device_name: name || 'Authenticator',
            },
        });
        if (saved.error) {
            toast({ tone: 'error', title: "Couldn't save authenticator", description: saved.error.message });
        }
        else {
            await supabase.auth.refreshSession();
            await refreshAssurance();
        }
        codesRequested.current = true;
        setCodes(nextCodes);
        setPending(false);
        setStep(2);
    }
    async function skip() {
        if (pending)
            return;
        setPending(true);
        if (factorId) {
            const removed = await supabase.auth.mfa.unenroll({ factorId });
            if (removed.error && !factorIsMissing(removed.error)) {
                setPending(false);
                toast({ tone: 'error', title: "Couldn't skip setup", description: removed.error.message });
                return;
            }
        }
        const saved = await supabase.auth.updateUser({
            data: { mfa_setup_skipped: true, mfa_reenroll_required: false },
        });
        if (saved.error) {
            setPending(false);
            toast({ tone: 'error', title: "Couldn't skip setup", description: saved.error.message });
            return;
        }
        setHold(null);
        clearAuthenticatorEnroll();
        await refreshAssurance();
        navigate(next, { replace: true });
    }
    async function finish(event) {
        event.preventDefault();
        if (!confirmed || pending)
            return;
        setPending(true);
        try {
            const saved = await supabase.auth.updateUser({
                data: { mfa_backup_pending: false, mfa_reenroll_required: false, mfa_setup_skipped: false },
            });
            if (saved.error) {
                toast({ tone: 'error', title: "Couldn't finish setup", description: saved.error.message });
                return;
            }
            const refreshed = await supabase.auth.refreshSession();
            if (refreshed.error) {
                toast({ tone: 'error', title: "Couldn't finish setup", description: refreshed.error.message });
                return;
            }
            setHold(null);
            await refreshAssurance();
            navigate(next, { replace: true });
        }
        catch (error) {
            toast({
                tone: 'error',
                title: "Couldn't finish setup",
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
            window.setTimeout(() => setCopied(false), 1500);
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
    async function copySecret() {
        try {
            await navigator.clipboard.writeText(secret.replace(/\s/g, ''));
            toast({ tone: 'success', title: 'Code copied to clipboard' });
        }
        catch (error) {
            toast({
                tone: 'error',
                title: "Couldn't copy code",
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
    if (step === 2) {
        return (_jsxs("form", { className: "flex flex-col gap-5", onSubmit: (event) => void finish(event), children: [_jsx(Header, { title: "Save your backup codes", subtitle: "Store these somewhere safe. Each code works once." }), _jsx("ul", { className: "grid grid-cols-2 justify-items-center gap-x-8 gap-y-2 rounded-md border border-[#ddd9d2] bg-[#f4f3ef] px-4 py-3 font-mono text-sm text-[#1c1b19]", children: codes.map((item) => (_jsx("li", { className: "text-center tracking-wide", children: item }, item))) }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(Button, { type: "button", variant: "outline", className: "h-10", onClick: () => void copyCodes(), disabled: codes.length === 0, children: copied ? 'Copied' : 'Copy' }), _jsx(Button, { type: "button", variant: "outline", className: "h-10", onClick: downloadCodes, disabled: codes.length === 0, children: "Download" })] }), _jsxs("div", { className: "grid gap-1.5", children: [_jsx(Label, { htmlFor: "backup-confirm", children: "Type \u201CI saved my codes\u201D" }), _jsx(Input, { id: "backup-confirm", autoComplete: "off", value: confirmation, onChange: (event) => setConfirmation(event.target.value) })] }), _jsx(Button, { type: "submit", className: "h-10", disabled: !confirmed || pending || codes.length === 0, loading: pending, children: "Complete" }), _jsx(SignOut, {})] }));
    }
    return (_jsxs("form", { className: "flex flex-col gap-5", onSubmit: (event) => void continueSetup(event), children: [_jsx(Header, { title: "Set up two-factor authentication", subtitle: "Scan the code with your authenticator app, then enter the 6-digit code." }), _jsxs("div", { className: "flex flex-col items-center gap-3", children: [qr ? (_jsx("img", { src: qrSource(qr), alt: "Authenticator QR code", className: "size-56 rounded-md border border-[#ddd9d2] bg-white p-2" })) : (_jsx("div", { className: "size-56 rounded-md border border-[#ddd9d2] bg-[#f4f3ef]" })), secret ? (_jsx("button", { type: "button", className: "text-center font-mono text-sm tracking-wide text-[#5e5c57] underline-offset-4 hover:underline", onClick: () => void copySecret(), children: groupSecret(secret) })) : (_jsx("p", { className: "text-sm text-[#5e5c57]", children: "Preparing setup code\u2026" }))] }), _jsx(OtpCodeField, { id: "setup-code", value: code, onChange: setCode, autoFocus: true }), _jsxs("div", { className: "grid gap-1.5", children: [_jsx(Label, { htmlFor: "device-name", children: "Device name" }), _jsx(Input, { id: "device-name", autoComplete: "off", placeholder: "Optional", value: deviceName, onChange: (event) => setDeviceName(event.target.value) })] }), _jsx(Button, { type: "submit", className: "h-10", disabled: pending || code.length < OTP_LENGTH || !factorId, loading: pending, children: otpButtonLabel(code.length, 'Continue') }), reenroll ? null : (_jsxs("p", { className: "text-center text-sm text-[#5e5c57]", children: ["Don't want to set up 2FA?", ' ', _jsx("button", { type: "button", className: "underline-offset-4 hover:underline", onClick: () => void skip(), disabled: pending, children: "Skip" })] })), _jsx(SignOut, {})] }));
}
function Header({ title, subtitle }) {
    return (_jsxs("div", { className: "flex flex-col items-center gap-3 text-center", children: [_jsx(BrandMark, { onLight: true, className: "size-16" }), _jsxs("div", { className: "grid gap-1", children: [_jsx(AuthSweepCopy, { as: "h1", className: "text-2xl font-medium tracking-tight", children: title }), _jsx(AuthSweepCopy, { delay: true, className: "text-sm text-[#5e5c57]", children: subtitle })] })] }));
}
function SignOut() {
    return (_jsx("p", { className: "text-center text-sm text-[#5e5c57]", children: _jsx("button", { type: "button", className: "underline-offset-4 hover:underline", onClick: () => void supabase.auth.signOut(), children: "Sign out" }) }));
}
