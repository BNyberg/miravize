import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Check, Circle, Eye, EyeSlash } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { AuthSocialButtons } from '@/components/auth/auth-social-buttons';
import { AuthSweepCopy } from '@/components/auth/auth-sweep-copy';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isValidEmail } from '@/lib/email';
import { PASSWORD_RULES, passwordIsStrong } from '@/lib/password';
import { supabase } from '@/lib/supabase';
import { suggestWorkspaceIdCode, workspaceIdInput } from '@/lib/workspace-id-code';
import { cn } from '@/lib/utils';
export function SignupPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [workspaceName, setWorkspaceName] = useState('Personal');
    const [idCode, setIdCode] = useState('');
    const [idConfirm, setIdConfirm] = useState(null);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    const [pending, setPending] = useState(false);
    const emailInvalid = email.length > 0 && !isValidEmail(email);
    const suggestion = suggestWorkspaceIdCode(workspaceName);
    const confirmedCode = (idConfirm ?? '').trim() || suggestion;
    const canSubmit = !pending && isValidEmail(email) && passwordIsStrong(password) && workspaceName.trim().length > 0;
    async function createAccount(code) {
        setPending(true);
        setError(null);
        setIdConfirm(null);
        const name = workspaceName.trim() || 'Personal';
        const { data, error: err } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: window.location.origin,
                data: { workspace_name: name, workspace_id_code: code },
            },
        });
        setPending(false);
        if (err) {
            setError(err.message);
            return;
        }
        if (!data.session) {
            setMessage('Check your email to confirm the account, then sign in. Your workspace is created with the account.');
        }
    }
    function onSubmit(e) {
        e.preventDefault();
        if (!canSubmit)
            return;
        if (!idCode.trim()) {
            setIdConfirm(suggestion);
            return;
        }
        void createAccount(idCode.trim());
    }
    return (_jsxs("form", { className: "flex flex-col gap-5", onSubmit: (e) => void onSubmit(e), children: [_jsxs("div", { className: "flex flex-col items-center gap-3 text-center", children: [_jsx(BrandMark, { onLight: true, className: "size-16" }), _jsxs("div", { className: "grid gap-1", children: [_jsx(AuthSweepCopy, { as: "h1", className: "text-2xl font-medium tracking-tight", children: "Create your account" }), _jsx(AuthSweepCopy, { delay: true, className: "text-sm text-[#5e5c57]", children: "Start with a workspace you can invite people into later." })] })] }), error ? (_jsx("div", { role: "alert", className: "rounded-md border border-destructive/40 p-3 text-sm", children: error })) : null, message ? _jsx("p", { className: "text-sm text-[#5e5c57]", children: message }) : null, _jsxs("div", { className: "grid gap-1.5", children: [_jsxs(Label, { htmlFor: "email", children: ["Email ", _jsx("span", { className: "text-destructive", children: "*" })] }), _jsx(Input, { id: "email", type: "email", required: true, "aria-required": true, "aria-invalid": emailInvalid, "aria-describedby": emailInvalid ? 'signup-email-error' : undefined, value: email, onChange: (e) => setEmail(e.target.value) }), emailInvalid ? (_jsx("p", { id: "signup-email-error", className: "text-sm text-destructive", children: "Enter a valid email address." })) : null] }), _jsxs("div", { className: "grid gap-1.5", children: [_jsxs(Label, { htmlFor: "password", children: ["Password ", _jsx("span", { className: "text-destructive", children: "*" })] }), _jsxs("div", { className: "relative", children: [_jsx(Input, { id: "password", type: showPassword ? 'text' : 'password', required: true, "aria-required": true, "aria-describedby": "password-rules", autoComplete: "new-password", className: "pr-10", value: password, onChange: (e) => setPassword(e.target.value) }), _jsx("button", { type: "button", className: "absolute inset-y-0 right-0 flex items-center px-3 text-[#5e5c57]", onClick: () => setShowPassword((open) => !open), "aria-label": showPassword ? 'Hide password' : 'Show password', children: showPassword ? _jsx(EyeSlash, { className: "size-4" }) : _jsx(Eye, { className: "size-4" }) })] }), _jsx("ul", { id: "password-rules", className: "grid gap-1 pt-1", children: PASSWORD_RULES.map((rule) => {
                            const met = rule.test(password);
                            return (_jsxs("li", { className: cn('flex items-center gap-2 text-sm', met ? 'text-[#1c1b19]' : 'text-[#5e5c57]'), children: [met ? (_jsx(Check, { className: "size-4 text-primary", weight: "bold", "aria-hidden": true })) : (_jsx(Circle, { className: "size-4", "aria-hidden": true })), rule.label] }, rule.id));
                        }) })] }), _jsxs("div", { className: "grid gap-1.5", children: [_jsxs(Label, { htmlFor: "workspace", children: ["First workspace ", _jsx("span", { className: "text-destructive", children: "*" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx(Input, { id: "workspace", required: true, "aria-required": true, className: "min-w-0 flex-1", value: workspaceName, onChange: (e) => setWorkspaceName(e.target.value) }), _jsx(Input, { "aria-label": "ID", className: "w-[3.4rem] uppercase", placeholder: suggestion, value: idCode, onChange: (e) => setIdCode(workspaceIdInput(e.target.value)) })] })] }), _jsx(Dialog, { open: idConfirm !== null, onOpenChange: (open) => { if (!open)
                    setIdConfirm(null); }, children: _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsxs(DialogTitle, { children: ["Use ID ", confirmedCode, "?"] }), _jsxs(DialogDescription, { children: ["Tasks and requests will look like T-", confirmedCode, "01 and R-", confirmedCode, "01."] })] }), _jsx(Input, { "aria-label": "ID", className: "h-9 uppercase", value: idConfirm ?? '', onChange: (e) => setIdConfirm(workspaceIdInput(e.target.value)) }), _jsxs(DialogFooter, { children: [_jsx(Button, { type: "button", variant: "outline", onClick: () => setIdConfirm(null), children: "Cancel" }), _jsx(Button, { type: "button", disabled: !confirmedCode || pending, onClick: () => void createAccount(confirmedCode), children: "Create" })] })] }) }), _jsx(Button, { type: "submit", className: "h-10", disabled: !canSubmit, children: "Create account" }), _jsx(AuthSocialButtons, {}), _jsxs("p", { className: "text-center text-sm text-[#5e5c57]", children: ["Already have an account?", ' ', _jsx(Link, { to: "/login", className: "font-medium text-[#1c1b19] underline-offset-4 hover:underline", children: "Sign in" })] })] }));
}
