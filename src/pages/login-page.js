import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Eye, EyeSlash } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { AuthSocialButtons } from '@/components/auth/auth-social-buttons';
import { AuthSweepCopy } from '@/components/auth/auth-sweep-copy';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isValidEmail } from '@/lib/email';
import { supabase } from '@/lib/supabase';
export function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);
    const [pending, setPending] = useState(false);
    const emailInvalid = email.length > 0 && !isValidEmail(email);
    async function onSubmit(e) {
        e.preventDefault();
        setPending(true);
        setError(null);
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) {
            setPending(false);
            setError(err.message);
        }
    }
    async function magicLink() {
        setPending(true);
        setError(null);
        const { error: err } = await supabase.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: window.location.origin },
        });
        setPending(false);
        if (err)
            setError(err.message);
        else
            setMessage('Check your email for a magic link.');
    }
    return (_jsxs("form", { className: "flex flex-col gap-5", onSubmit: (e) => void onSubmit(e), children: [_jsxs("div", { className: "flex flex-col items-center gap-3 text-center", children: [_jsx(BrandMark, { onLight: true, className: "size-16" }), _jsxs("div", { className: "grid gap-1", children: [_jsx(AuthSweepCopy, { as: "h1", className: "text-2xl font-medium tracking-tight", children: "Welcome back!" }), _jsx(AuthSweepCopy, { delay: true, className: "text-sm text-[#5e5c57]", children: "Please enter your details" })] })] }), error ? (_jsx("div", { role: "alert", className: "rounded-md border border-destructive/40 p-3 text-sm", children: error })) : null, message ? _jsx("p", { className: "text-sm text-[#5e5c57]", children: message }) : null, _jsxs("div", { className: "grid gap-1.5", children: [_jsx(Label, { htmlFor: "email", children: "Email" }), _jsx(Input, { id: "email", type: "email", autoComplete: "email", required: true, "aria-invalid": emailInvalid, "aria-describedby": emailInvalid ? 'email-error' : undefined, value: email, onChange: (e) => setEmail(e.target.value) }), emailInvalid ? (_jsx("p", { id: "email-error", className: "text-sm text-destructive", children: "Enter a valid email address." })) : null] }), _jsxs("div", { className: "grid gap-1.5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx(Label, { htmlFor: "password", children: "Password" }), _jsx(Link, { to: "/forgot-password", className: "text-sm text-[#5e5c57] underline-offset-4 hover:underline", children: "Forgot password?" })] }), _jsxs("div", { className: "relative", children: [_jsx(Input, { id: "password", type: showPassword ? 'text' : 'password', autoComplete: "current-password", className: "pr-10", value: password, onChange: (e) => setPassword(e.target.value) }), _jsx("button", { type: "button", className: "absolute inset-y-0 right-0 flex items-center px-3 text-[#5e5c57]", onClick: () => setShowPassword((open) => !open), "aria-label": showPassword ? 'Hide password' : 'Show password', children: showPassword ? _jsx(EyeSlash, { className: "size-4" }) : _jsx(Eye, { className: "size-4" }) })] })] }), _jsxs("div", { className: "grid gap-2", children: [_jsx(Button, { type: "submit", className: "h-10", disabled: pending || !password, children: "Log In" }), _jsx(Button, { type: "button", variant: "ghost", className: "h-9 text-sm text-[#5e5c57]", disabled: pending || !isValidEmail(email), onClick: () => void magicLink(), children: "Email magic link" })] }), _jsx(AuthSocialButtons, {}), _jsxs("p", { className: "text-center text-sm text-[#5e5c57]", children: ["Don't have an account?", ' ', _jsx(Link, { to: "/signup", className: "font-medium text-[#1c1b19] underline-offset-4 hover:underline", children: "Sign Up" })] })] }));
}
