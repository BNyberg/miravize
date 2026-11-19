import { jsx as _jsx } from "react/jsx-runtime";
import { useRef } from 'react';
import { OTP_LENGTH, digitsOnly } from '@/features/auth/mfa';
import { cn } from '@/lib/utils';
export function OtpCodeField({ id, value, onChange, autoFocus = false, }) {
    const refs = useRef([]);
    const digits = Array.from({ length: OTP_LENGTH }, (_, index) => value[index] ?? '');
    function setDigit(index, next) {
        const chars = digits.slice();
        chars[index] = next;
        onChange(chars.join(''));
    }
    function focusBox(index) {
        refs.current[Math.max(0, Math.min(OTP_LENGTH - 1, index))]?.focus();
    }
    return (_jsx("div", { className: "grid grid-cols-6 gap-2", children: digits.map((digit, index) => (_jsx("input", { ref: (node) => {
                refs.current[index] = node;
            }, id: index === 0 ? id : undefined, name: index === 0 ? 'one-time-code' : undefined, value: digit, autoFocus: autoFocus && index === 0, autoComplete: index === 0 ? 'one-time-code' : 'off', inputMode: "numeric", pattern: "[0-9]*", maxLength: index === 0 ? OTP_LENGTH : 1, "aria-label": index === 0 ? 'Authentication code' : `Digit ${index + 1}`, className: cn('h-14 w-full rounded-md border border-input bg-white text-center text-xl font-medium text-[#1c1b19] outline-none transition-colors duration-75 hover:bg-muted', 'focus:bg-white focus:ring-2 focus:ring-ring'), onChange: (event) => {
                const next = digitsOnly(event.target.value);
                if (index === 0 && next.length > 1) {
                    onChange(next);
                    focusBox(Math.min(OTP_LENGTH, next.length) - 1);
                    return;
                }
                setDigit(index, next.slice(-1));
                if (next)
                    focusBox(index + 1);
            }, onKeyDown: (event) => {
                if (event.key === 'Backspace' && !digits[index]) {
                    event.preventDefault();
                    setDigit(index - 1, '');
                    focusBox(index - 1);
                    return;
                }
                if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    focusBox(index - 1);
                    return;
                }
                if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    focusBox(index + 1);
                }
            }, onPaste: (event) => {
                event.preventDefault();
                const next = digitsOnly(event.clipboardData.getData('text'));
                onChange(next);
                focusBox(Math.min(OTP_LENGTH, Math.max(1, next.length)) - 1);
            }, onFocus: (event) => event.target.select() }, index))) }));
}
