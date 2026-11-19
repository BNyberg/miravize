import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Link } from 'react-router';
import { AuthSweepCopy } from '@/components/auth/auth-sweep-copy';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { isValidEmail } from '@/lib/email';
import { supabase } from '@/lib/supabase';
export function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState(null);
    const [pending, setPending] = useState(false);
    const emailInvalid = email.length > 0 && !isValidEmail(email);
    async function onSubmit(e) {
        e.preventDefault();
        if (!isValidEmail(email) || pending)
            return;
        setPending(true);
        setMessage(null);
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        });
        setPending(false);
        if (error) {
            toast({ tone: 'error', title: "Couldn't send reset email", description: error.message });
            return;
        }
        setMessage('Check your email for a link to choose a new password.');
    }
    return (_jsxs("form", { className: "flex flex-col gap-5", onSubmit: (e) => void onSubmit(e), children: [_jsxs("div", { className: "flex flex-col items-center gap-3 text-center", children: [_jsx(BrandMark, { onLight: true, className: "size-16" }), _jsxs("div", { className: "grid gap-1", children: [_jsx(AuthSweepCopy, { as: "h1", className: "text-2xl font-medium tracking-tight", children: "Reset your password" }), _jsx(AuthSweepCopy, { delay: true, className: "text-sm text-[#5e5c57]", children: "We will email you a link to choose a new one." })] })] }), message ? _jsx("p", { className: "text-sm text-[#5e5c57]", children: message }) : null, _jsxs("div", { className: "grid gap-1.5", children: [_jsx(Label, { htmlFor: "email", children: "Email" }), _jsx(Input, { id: "email", type: "email", autoComplete: "email", required: true, "aria-invalid": emailInvalid, "aria-describedby": emailInvalid ? 'email-error' : undefined, value: email, onChange: (e) => setEmail(e.target.value) }), emailInvalid ? (_jsx("p", { id: "email-error", className: "text-sm text-destructive", children: "Enter a valid email address." })) : null] }), _jsx(Button, { type: "submit", className: "h-10", disabled: pending || !isValidEmail(email), children: "Send reset link" }), _jsx("p", { className: "text-center text-sm text-[#5e5c57]", children: _jsx(Link, { to: "/login", className: "font-medium text-[#1c1b19] underline-offset-4 hover:underline", children: "Back to log in" }) })] }));
}
