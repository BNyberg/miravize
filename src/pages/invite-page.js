import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
export function InvitePage() {
    const { token } = useParams();
    const navigate = useNavigate();
    const accept = useMutation({
        mutationFn: async () => {
            const { error } = await supabase.rpc('accept_workspace_invite', { p_token: token });
            if (error)
                throw error;
        },
        onSuccess: () => navigate('/timer'),
    });
    return (_jsx("div", { className: "flex min-h-svh items-center justify-center p-4", children: _jsxs(Card, { className: "w-full max-w-md", children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Workspace invite" }) }), _jsxs(CardContent, { className: "space-y-3", children: [accept.error ? (_jsx("div", { role: "alert", className: "text-sm text-destructive", children: accept.error.message })) : null, _jsx("p", { className: "text-sm text-muted-foreground", children: "Accepting this invite adds you to the workspace. Your account email must match the invite." }), _jsx(Button, { onClick: () => accept.mutate(), disabled: accept.isPending || !token, children: "Accept invite" })] })] }) }));
}
