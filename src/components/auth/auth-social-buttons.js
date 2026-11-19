import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AppleLogo, GithubLogo, GoogleLogo } from '@phosphor-icons/react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
const PROVIDERS = [
    { id: 'google', label: 'Google', Icon: GoogleLogo },
    { id: 'github', label: 'GitHub', Icon: GithubLogo },
    { id: 'apple', label: 'Apple', Icon: AppleLogo },
];
export function AuthSocialButtons() {
    return (_jsxs("div", { className: "grid gap-4", children: [_jsxs("div", { className: "flex items-center gap-3 text-xs text-[#8a8780]", children: [_jsx("span", { className: "h-px flex-1 bg-[#e4e0d8]" }), "Or", _jsx("span", { className: "h-px flex-1 bg-[#e4e0d8]" })] }), _jsx(TooltipProvider, { delayDuration: 150, children: _jsx("div", { className: "grid grid-cols-3 gap-2", children: PROVIDERS.map(({ id, label, Icon }) => (_jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsxs("span", { tabIndex: 0, role: "button", "aria-disabled": "true", title: "Coming soon", "aria-label": `${label} — coming soon`, className: "inline-flex h-10 w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-md border border-[#ddd9d2] bg-white px-1.5 text-xs text-[#1c1b19] opacity-50", children: [_jsx(Icon, { weight: "fill", className: "size-4 shrink-0" }), label] }) }), _jsx(TooltipContent, { children: "Coming soon" })] }, id))) }) })] }));
}
