import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from '@/lib/utils';
import './auth-sweep-copy.css';
export function AuthSweepCopy({ as: Tag = 'p', delay = false, className, children, }) {
    return (_jsx(Tag, { className: cn('auth-sweep', delay && 'auth-sweep-delay', className), children: children }));
}
