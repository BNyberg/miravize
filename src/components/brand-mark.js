import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@/lib/utils';
export function BrandMark({ className, onLight = false, }) {
    return (_jsxs("span", { className: cn('relative inline-block size-5 shrink-0', className), children: [_jsx("img", { src: "/logo-black.png", alt: "", className: cn('size-full object-contain', onLight ? '' : 'dark:hidden') }), onLight ? null : (_jsx("img", { src: "/logo-white.png", alt: "", className: "hidden size-full object-contain dark:block" }))] }));
}
