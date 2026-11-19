import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Check, Circle, Eye, EyeSlash } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AuthSweepCopy } from '@/components/auth/auth-sweep-copy';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { PASSWORD_RULES, passwordIsStrong } from '@/lib/password';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
export function ResetPasswordPage() {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [pending, setPending] = useState(false);
    const canSubmit = !pending && passwordIsStrong(password);
    async function onSubmit(e) {
        e.preventDefault();
        if (!canSubmit)
            return;
        setPending(true);
        const { error } = await supabase.auth.updateUser({ password });
        setPending(false);
        if (error) {
            toast({ tone: 'error', title: "Couldn't update password", description: error.message });
            return;
        }
        navigate('/timer');
    }
    if (loading)
        return _jsx("p", { className: "text-sm text-[#5e5c57]", children: "Loading\u2026" });
    if (!user) {
        return (_jsxs("div", { className: "flex flex-col items-center gap-4 text-center", children: [_jsx(BrandMark, { onLight: true, className: "size-16" }), _jsx(AuthSweepCopy, { as: "h1", className: "text-2xl font-medium tracking-tight", children: "Reset link required" }), _jsx("p", { className: "text-sm text-[#5e5c57]", children: "Open the link in your reset email, then choose a new password." }), _jsx(Link, { to: "/forgot-password", className: "text-sm font-medium text-[#1c1b19] underline-offset-4 hover:underline", children: "Send a new link" })] }));
    }
    return (_jsxs("form", { className: "flex flex-col gap-5", onSubmit: (e) => void onSubmit(e), children: [_jsxs("div", { className: "flex flex-col items-center gap-3 text-center", children: [_jsx(BrandMark, { onLight: true, className: "size-16" }), _jsx(AuthSweepCopy, { as: "h1", className: "text-2xl font-medium tracking-tight", children: "Choose a new password" })] }), _jsxs("div", { className: "grid gap-1.5", children: [_jsx(Label, { htmlFor: "password", children: "Password" }), _jsxs("div", { className: "relative", children: [_jsx(Input, { id: "password", type: showPassword ? 'text' : 'password', autoComplete: "new-password", "aria-describedby": "password-rules", className: "pr-10", value: password, onChange: (e) => setPassword(e.target.value) }), _jsx("button", { type: "button", className: "absolute inset-y-0 right-0 flex items-center px-3 text-[#5e5c57]", onClick: () => setShowPassword((open) => !open), "aria-label": showPassword ? 'Hide password' : 'Show password', children: showPassword ? _jsx(EyeSlash, { className: "size-4" }) : _jsx(Eye, { className: "size-4" }) })] }), _jsx("ul", { id: "password-rules", className: "grid gap-1 pt-1", children: PASSWORD_RULES.map((rule) => {
                            const met = rule.test(password);
                            return (_jsxs("li", { className: cn('flex items-center gap-2 text-sm', met ? 'text-[#1c1b19]' : 'text-[#5e5c57]'), children: [met ? _jsx(Check, { className: "size-3.5" }) : _jsx(Circle, { className: "size-3.5" }), rule.label] }, rule.id));
                        }) })] }), _jsx(Button, { type: "submit", className: "h-10", disabled: !canSubmit, children: "Save password" })] }));
}
